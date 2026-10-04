import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SafetySession,
  assertLocalDockerHost,
  assertTargetAllowed,
  watchErrorRate
} from "./safety.js";

afterEach(() => vi.useRealTimers());

describe("safety boundary", () => {
  it("refuses remote and unrecognized Docker hosts", () => {
    expect(() => assertLocalDockerHost("tcp://10.0.0.8:2375")).toThrow("non-local");
    expect(() => assertLocalDockerHost("ssh://localhost")).toThrow("non-local");
    expect(() => assertLocalDockerHost("not-a-url")).toThrow("unrecognized");
  });

  it("accepts local Docker transports", () => {
    expect(() => assertLocalDockerHost(undefined)).not.toThrow();
    expect(() => assertLocalDockerHost("npipe:////./pipe/docker_engine")).not.toThrow();
    expect(() => assertLocalDockerHost("unix:///var/run/docker.sock")).not.toThrow();
    expect(() => assertLocalDockerHost("tcp://127.0.0.1:2375")).not.toThrow();
  });

  it("refuses an unlabeled or mismatched target", () => {
    expect(() =>
      assertTargetAllowed({ id: "one", service: "postgres", labels: {} }, "postgres")
    ).toThrow("unlabeled");
    expect(() =>
      assertTargetAllowed(
        { id: "two", service: "payment-worker", labels: { "chaos-target": "true" } },
        "payment-api"
      )
    ).toThrow("not Compose service");
  });

  it("runs registered reverts in reverse order exactly once", async () => {
    const order: number[] = [];
    const session = new SafetySession(10_000);
    session.registerRevert(async () => void order.push(1));
    session.registerRevert(async () => void order.push(2));
    await session.cleanup();
    await session.cleanup();
    expect(order).toEqual([2, 1]);
  });

  it("aborts on an over-aggressive error threshold", async () => {
    const session = new SafetySession(10_000);
    const stop = new AbortController();
    await expect(
      watchErrorRate(
        async () => ({
          error_rate: 0.2,
          p95_seconds: null,
          throughput_per_second: 1,
          measured_at: new Date().toISOString()
        }),
        0.1,
        session,
        stop.signal,
        1
      )
    ).rejects.toThrow("Safety abort");
    expect(session.signal.aborted).toBe(true);
    await session.cleanup();
  });

  it("enforces the hard duration", async () => {
    vi.useFakeTimers();
    const session = new SafetySession(50);
    await vi.advanceTimersByTimeAsync(50);
    expect(session.signal.aborted).toBe(true);
    await session.cleanup();
  });
});
