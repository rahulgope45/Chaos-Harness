import { describe, expect, it, vi } from "vitest";
import { executeLifecycle, type LifecycleHooks, type Phase } from "./lifecycle.js";

function hooks(overrides: Partial<LifecycleHooks> = {}) {
  const phases: Phase[] = [];
  const defaults: LifecycleHooks = {
    preflight: async () => undefined,
    baseline: async () => undefined,
    inject: async () => undefined,
    observe: async () => undefined,
    revert: async () => undefined,
    recoveryWait: async () => undefined,
    verify: async () => undefined,
    report: async () => undefined,
    onPhase: async (phase) => void phases.push(phase)
  };
  return { phases, value: { ...defaults, ...overrides } };
}

describe("experiment lifecycle", () => {
  it("executes phases in the required order", async () => {
    const fixture = hooks();
    await executeLifecycle(fixture.value);
    expect(fixture.phases).toEqual([
      "preflight",
      "baseline",
      "inject",
      "observe",
      "revert",
      "recovery_wait",
      "verify",
      "report"
    ]);
  });

  it("always reverts when observation fails", async () => {
    const revert = vi.fn(async () => undefined);
    const fixture = hooks({
      observe: async () => {
        throw new Error("synthetic observation failure");
      },
      revert
    });
    await expect(executeLifecycle(fixture.value)).rejects.toThrow("synthetic observation failure");
    expect(revert).toHaveBeenCalledOnce();
    expect(fixture.phases.at(-1)).toBe("revert");
  });
});
