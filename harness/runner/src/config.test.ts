import { describe, expect, it } from "vitest";
import { experimentSchema } from "./config.js";

const base = {
  name: "sensor-outage",
  hypothesis: "Missing telemetry causes blind mode without unsafe controller action.",
  target: "metrics-proxy",
  seed: 701,
  repeat: 1,
  duration_s: 10,
  steady_state: { max_error_rate: 0.02 },
  abort_if: { error_rate_above: 0.1 },
  invariants: ["I1"] as const
};

describe("FS-3 experiment config", () => {
  it("accepts only the stopped metrics sensor", () => {
    const parsed = experimentSchema.parse({
      ...base,
      fault: "FS_3",
      fs3: { action: "stop", inject_after_s: 2 }
    });
    expect(parsed.target).toBe("metrics-proxy");
    expect(parsed.fs3?.action).toBe("stop");
  });

  it("rejects an FS-3 experiment aimed at an application service", () => {
    expect(() =>
      experimentSchema.parse({
        ...base,
        target: "payment-api",
        fault: "FS_3",
        fs3: { action: "stop", inject_after_s: 2 }
      })
    ).toThrow(/metrics-proxy/);
  });
});

describe("FS-2 experiment config", () => {
  it.each(["spike", "drop", "freeze", "noise", "counter_reset"] as const)(
    "accepts the %s metrics-proxy mode",
    (mode) => {
      const parsed = experimentSchema.parse({
        ...base,
        fault: "FS_2",
        fs2: { mode, inject_after_s: 2 }
      });
      expect(parsed.fs2?.mode).toBe(mode);
    }
  );

  it("rejects FS-2 against an application container", () => {
    expect(() =>
      experimentSchema.parse({
        ...base,
        target: "payment-worker",
        fault: "FS_2",
        fs2: { mode: "spike", inject_after_s: 2 }
      })
    ).toThrow(/metrics-proxy/);
  });
});
