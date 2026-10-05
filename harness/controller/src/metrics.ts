import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export function createControllerMetrics() {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: "chaos_controller_" });
  const cycleDuration = new Histogram({
    name: "chaos_controller_cycle_duration_seconds",
    help: "Duration of one controller monitoring cycle",
    registers: [registry]
  });
  const actions = new Counter({
    name: "chaos_controller_actions_total",
    help: "Controller actions by target and result",
    labelNames: ["target", "action", "result"] as const,
    registers: [registry]
  });
  const policyBlocks = new Counter({
    name: "chaos_controller_policy_blocks_total",
    help: "Actions blocked by cooldown or restart limit",
    labelNames: ["policy", "reason"] as const,
    registers: [registry]
  });
  const targetRunning = new Gauge({
    name: "chaos_controller_target_running",
    help: "Whether a monitored target is running",
    labelNames: ["target"] as const,
    registers: [registry]
  });
  const telemetryAvailable = new Gauge({
    name: "chaos_controller_telemetry_available",
    help: "Whether every required telemetry scrape target is available",
    registers: [registry]
  });
  const telemetryAlerts = new Counter({
    name: "chaos_controller_telemetry_alerts_total",
    help: "Transitions into telemetry blind or invalid mode",
    labelNames: ["reason"] as const,
    registers: [registry]
  });
  const telemetryValid = new Gauge({
    name: "chaos_controller_telemetry_valid",
    help: "Whether required telemetry is present, fresh, bounded, finite, and monotonic",
    registers: [registry]
  });
  return {
    registry,
    cycleDuration,
    actions,
    policyBlocks,
    targetRunning,
    telemetryAvailable,
    telemetryAlerts,
    telemetryValid
  };
}

export type ControllerMetrics = ReturnType<typeof createControllerMetrics>;
