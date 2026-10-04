-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payments_amount_minor_positive" CHECK ("amount_minor" > 0)
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "account" TEXT NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ledger_entries_amount_minor_positive" CHECK ("amount_minor" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "ledger_entries_payment_id_idx" ON "ledger_entries"("payment_id");

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ledger rows are financial records and must never be changed in place.
CREATE FUNCTION reject_ledger_entry_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'ledger_entries is append-only; % is not allowed', TG_OP
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER ledger_entries_append_only
BEFORE UPDATE OR DELETE ON "ledger_entries"
FOR EACH ROW
EXECUTE FUNCTION reject_ledger_entry_mutation();

-- Check balance at transaction commit so a debit and its matching credit can
-- be inserted as separate statements inside one transaction.
CREATE FUNCTION check_payment_ledger_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    affected_payment_id uuid := COALESCE(NEW.payment_id, OLD.payment_id);
    balance bigint;
BEGIN
    SELECT COALESCE(SUM(
        CASE direction
            WHEN 'DEBIT' THEN amount_minor
            WHEN 'CREDIT' THEN -amount_minor
        END
    ), 0)
    INTO balance
    FROM ledger_entries
    WHERE payment_id = affected_payment_id;

    IF balance <> 0 THEN
        RAISE EXCEPTION 'ledger entries for payment % are unbalanced by % minor units',
            affected_payment_id,
            balance
            USING ERRCODE = '23514';
    END IF;

    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ledger_entries_balanced
AFTER INSERT OR UPDATE OR DELETE ON "ledger_entries"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_payment_ledger_balance();
