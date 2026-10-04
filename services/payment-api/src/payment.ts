import { createHash, randomUUID } from "node:crypto";
import { Prisma, type DatabaseClient } from "@chaos/database";
import type { Redis } from "ioredis";
import { z } from "zod";

export const paymentRequestSchema = z.object({
  amount_minor: z.number().int().positive().safe(),
  currency: z.string().regex(/^[A-Z]{3}$/)
});

export type PaymentRequest = z.infer<typeof paymentRequestSchema>;

export interface PaymentResponse {
  id: string;
  idempotency_key: string;
  amount_minor: string;
  currency: string;
  status: string;
  created_at: string;
}

export type CreatePaymentResult =
  | { kind: "created"; payment: PaymentResponse }
  | { kind: "replayed"; payment: PaymentResponse }
  | { kind: "mismatch" }
  | { kind: "in_flight" };

interface Dependencies {
  database: DatabaseClient;
  redis: Redis;
  lockTtlMs: number;
}

function requestHash(request: PaymentRequest): string {
  return createHash("sha256")
    .update(JSON.stringify([request.amount_minor, request.currency]))
    .digest("hex");
}

function serializePayment(payment: {
  id: string;
  idempotencyKey: string;
  amountMinor: bigint;
  currency: string;
  status: string;
  createdAt: Date;
}): PaymentResponse {
  return {
    id: payment.id,
    idempotency_key: payment.idempotencyKey,
    amount_minor: payment.amountMinor.toString(),
    currency: payment.currency,
    status: payment.status,
    created_at: payment.createdAt.toISOString()
  };
}

export function createPaymentService({ database, redis, lockTtlMs }: Dependencies) {
  async function findExisting(
    idempotencyKey: string,
    hash: string
  ): Promise<CreatePaymentResult | null> {
    const existing = await database.payment.findUnique({ where: { idempotencyKey } });
    if (!existing) {
      return null;
    }
    if (existing.requestHash !== hash) {
      return { kind: "mismatch" };
    }
    return { kind: "replayed", payment: serializePayment(existing) };
  }

  async function releaseLock(lockKey: string, token: string): Promise<void> {
    await redis
      .eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        lockKey,
        token
      )
      .catch(() => undefined);
  }

  async function createPayment(
    idempotencyKey: string,
    request: PaymentRequest
  ): Promise<CreatePaymentResult> {
    const hash = requestHash(request);
    const cachedId = await redis.get(`payment:${idempotencyKey}`).catch(() => null);
    if (cachedId) {
      const cached = await database.payment.findUnique({ where: { id: cachedId } });
      if (cached) {
        return cached.requestHash === hash
          ? { kind: "replayed", payment: serializePayment(cached) }
          : { kind: "mismatch" };
      }
    }

    const existing = await findExisting(idempotencyKey, hash);
    if (existing) {
      return existing;
    }

    const lockKey = `payment-lock:${idempotencyKey}`;
    const token = randomUUID();
    let ownsLock = false;
    try {
      ownsLock =
        (await redis.set(lockKey, token, "PX", lockTtlMs, "NX").catch(() => null)) === "OK";
      if (!ownsLock && redis.status === "ready") {
        return { kind: "in_flight" };
      }

      const afterLock = await findExisting(idempotencyKey, hash);
      if (afterLock) {
        return afterLock;
      }

      try {
        const payment = await database.$transaction(async (transaction) => {
          const created = await transaction.payment.create({
            data: {
              idempotencyKey,
              requestHash: hash,
              amountMinor: BigInt(request.amount_minor),
              currency: request.currency
            }
          });
          await transaction.ledgerEntry.createMany({
            data: [
              {
                paymentId: created.id,
                account: "customer",
                direction: "DEBIT",
                amountMinor: created.amountMinor
              },
              {
                paymentId: created.id,
                account: "merchant",
                direction: "CREDIT",
                amountMinor: created.amountMinor
              }
            ]
          });
          return created;
        });

        await redis.set(`payment:${idempotencyKey}`, payment.id, "EX", 3600).catch(() => undefined);
        return { kind: "created", payment: serializePayment(payment) };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const raced = await findExisting(idempotencyKey, hash);
          if (raced) {
            return raced;
          }
        }
        throw error;
      }
    } finally {
      if (ownsLock) {
        await releaseLock(lockKey, token);
      }
    }
  }

  async function getPayment(id: string): Promise<PaymentResponse | null> {
    const payment = await database.payment.findUnique({ where: { id } });
    return payment ? serializePayment(payment) : null;
  }

  return { createPayment, getPayment };
}
