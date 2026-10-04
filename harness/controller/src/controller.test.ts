import type { ResponseEvent, ResponseEventInput } from "@chaos/runner/response-tracker";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { MapekController } from "./controller.js";
import type { ControllerEventSink } from "./events.js";
import { createControllerMetrics } from "./metrics.js";
import type { ControllerPolicy, TargetSnapshot } from "./policy.js";
import type { PolicyStore } from "./store.js";
import type { TargetManager } from "./docker-target.js";

const policy: ControllerPolicy = {
  id: "restart-payment-worker-v1",
  version: 1,
  enabled: true,
  targetService: "payment-worker",
  condition: "container_not_running",
  action: "restart",
  breachCount: 2,
  cooldownMs: 5000,
  maxRestarts: 3,
  restartWindowMs: 60_000,
  pollIntervalMs: 500
};

describe("MAPE-K controller cycle", () => {
  it("reloads policy, detects after hysteresis, plans, and verifies restart", async () => {
    let loads = 0;
    let observations = 0;
    let restarts = 0;
    const recorded: ResponseEventInput[] = [];
    const store: PolicyStore = {
      loadEnabled: async () => {
        loads += 1;
        return [policy];
      },
      close: async () => undefined
    };
    const targets: TargetManager = {
      observe: async (): Promise<TargetSnapshot> => ({
        service: "payment-worker",
        running: false,
        paused: false,
        observedAtMs: 1000 + observations++ * 500
      }),
      restartAndVerify: async () => {
        restarts += 1;
      }
    };
    const events: ControllerEventSink = {
      record: async (input) => {
        recorded.push(input);
        return null as ResponseEvent | null;
      }
    };
    const controller = new MapekController(
      store,
      targets,
      events,
      createControllerMetrics(),
      pino({ level: "silent" })
    );

    await controller.cycle();
    await controller.cycle();

    expect(loads).toBe(2);
    expect(restarts).toBe(1);
    expect(recorded.map(({ event }) => event)).toEqual([
      "anomaly_detected",
      "plan_selected",
      "action_executed"
    ]);
  });
});
