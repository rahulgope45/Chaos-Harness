-- CreateTable
CREATE TABLE "webhook_outbox" (
    "event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),
    "publish_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,

    CONSTRAINT "webhook_outbox_pkey" PRIMARY KEY ("event_id"),
    CONSTRAINT "webhook_outbox_publish_attempts_nonnegative" CHECK ("publish_attempts" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_outbox_payment_id_key" ON "webhook_outbox"("payment_id");

-- CreateIndex
CREATE INDEX "webhook_outbox_published_at_created_at_idx" ON "webhook_outbox"("published_at", "created_at");

-- AddForeignKey
ALTER TABLE "webhook_outbox" ADD CONSTRAINT "webhook_outbox_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
