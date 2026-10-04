import { describe, expect, it } from "vitest";
import { createSchedule } from "./schedule.js";

describe("open-loop schedule", () => {
  it("is reproducible from the seed", () => {
    expect(createSchedule(42, 10_000, 10)).toEqual(createSchedule(42, 10_000, 10));
    expect(createSchedule(42, 10_000, 10)).not.toEqual(createSchedule(43, 10_000, 10));
  });

  it("precomputes increasing arrivals independent of response completion", () => {
    const schedule = createSchedule(7, 5000, 5);
    expect(schedule.length).toBeGreaterThan(0);
    expect(
      schedule.every((item, index) => index === 0 || item.offsetMs > schedule[index - 1]!.offsetMs)
    ).toBe(true);
  });

  it("isolates idempotency keys between run namespaces while retaining in-run replays", () => {
    const first = createSchedule(401, 10_000, 20, "run-a");
    const second = createSchedule(401, 10_000, 20, "run-b");

    expect(first.map(({ offsetMs }) => offsetMs)).toEqual(second.map(({ offsetMs }) => offsetMs));
    expect(first.every(({ idempotencyKey }) => idempotencyKey.startsWith("run-a-"))).toBe(true);
    expect(second.every(({ idempotencyKey }) => idempotencyKey.startsWith("run-b-"))).toBe(true);
    expect(new Set(first.map(({ idempotencyKey }) => idempotencyKey)).size).toBeLessThan(
      first.length
    );
  });
});
