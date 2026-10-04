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
});
