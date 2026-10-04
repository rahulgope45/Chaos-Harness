import { describe, expect, it } from "vitest";
import {
  evaluatePolicy,
  initialPolicyState,
  recordAction,
  type ControllerPolicy
} from "./policy.js";

const policy: ControllerPolicy = {
  id: "restart-worker-v1",
  version: 1,
  enabled: true,
  targetService: "payment-worker",
  condition: "container_not_running",
  action: "restart",
  breachCount: 2,
  cooldownMs: 5000,
  maxRestarts: 2,
  restartWindowMs: 60_000,
  pollIntervalMs: 500
};

const down = (observedAtMs: number) => ({
  service: "payment-worker",
  running: false,
  paused: false,
  observedAtMs
});

describe("controller policy evaluation", () => {
  it("requires consecutive breaches before planning", () => {
    const first = evaluatePolicy(policy, down(1000), initialPolicyState());
    const second = evaluatePolicy(policy, down(1500), first.state);
    expect(first.plan).toBeNull();
    expect(first.detected).toBe(false);
    expect(second.plan).toBe("restart");
    expect(second.detected).toBe(true);
  });

  it("resets hysteresis after a healthy observation", () => {
    const first = evaluatePolicy(policy, down(1000), initialPolicyState());
    const healthy = evaluatePolicy(
      policy,
      { service: "payment-worker", running: true, paused: false, observedAtMs: 1500 },
      first.state
    );
    expect(healthy.state.consecutiveBreaches).toBe(0);
    expect(healthy.state.incidentOpen).toBe(false);
  });

  it("enforces cooldown after an action", () => {
    const acted = recordAction({ ...initialPolicyState(), consecutiveBreaches: 2 }, 2000);
    const result = evaluatePolicy(policy, down(3000), acted);
    expect(result.plan).toBeNull();
    expect(result.blockedBy).toBe("cooldown");
  });

  it("enforces the restart limit within its window", () => {
    let state = recordAction({ ...initialPolicyState(), consecutiveBreaches: 2 }, 1000);
    state = recordAction(state, 7000);
    const result = evaluatePolicy(policy, down(13_000), state);
    expect(result.plan).toBeNull();
    expect(result.blockedBy).toBe("restart_limit");
  });
});
