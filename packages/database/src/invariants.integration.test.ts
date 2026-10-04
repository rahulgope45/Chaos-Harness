import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://chaos:chaos@127.0.0.1:5432/chaos_harness";

const pool = new Pool({ connectionString, max: 2 });

type PostgreSqlError = Error & { code?: string };

async function expectPostgreSqlError(
  operation: Promise<unknown>,
  expectedCode: string
): Promise<void> {
  try {
    await operation;
    throw new Error(`Expected PostgreSQL error ${expectedCode}`);
  } catch (error) {
    expect((error as PostgreSqlError).code).toBe(expectedCode);
  }
}

async function insertPayment(client: PoolClient, idempotencyKey: string): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO payments
      (idempotency_key, request_hash, amount_minor, currency)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [idempotencyKey, "request-hash", 1000, "USD"]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Payment insert returned no row");
  }
  return row.id;
}

beforeAll(async () => {
  await pool.query("SELECT 1");
});

afterAll(async () => {
  await pool.end();
});

describe("database-enforced financial invariants", () => {
  it("rejects an unbalanced ledger at transaction commit", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const paymentId = await insertPayment(client, `unbalanced-${randomUUID()}`);
      await client.query(
        `INSERT INTO ledger_entries
          (payment_id, account, direction, amount_minor)
         VALUES ($1, 'customer', 'DEBIT', 1000)`,
        [paymentId]
      );

      await expectPostgreSqlError(client.query("COMMIT"), "23514");
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("rejects updates to append-only ledger entries", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const paymentId = await insertPayment(client, `append-only-${randomUUID()}`);
      const debit = await client.query<{ id: string }>(
        `INSERT INTO ledger_entries
          (payment_id, account, direction, amount_minor)
         VALUES ($1, 'customer', 'DEBIT', 1000)
         RETURNING id`,
        [paymentId]
      );
      await client.query(
        `INSERT INTO ledger_entries
          (payment_id, account, direction, amount_minor)
         VALUES ($1, 'merchant', 'CREDIT', 1000)`,
        [paymentId]
      );
      await client.query("COMMIT");

      const debitId = debit.rows[0]?.id;
      if (!debitId) {
        throw new Error("Debit insert returned no row");
      }
      await expectPostgreSqlError(
        client.query("UPDATE ledger_entries SET amount_minor = 2000 WHERE id = $1", [debitId]),
        "55000"
      );
    } finally {
      client.release();
    }
  });

  it("rejects duplicate idempotency keys", async () => {
    const client = await pool.connect();
    const key = `duplicate-${randomUUID()}`;
    try {
      await insertPayment(client, key);
      await expectPostgreSqlError(insertPayment(client, key), "23505");
    } finally {
      client.release();
    }
  });
});
