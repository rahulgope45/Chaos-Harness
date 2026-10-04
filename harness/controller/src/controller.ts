import type { Logger } from "pino";
import type { ControllerEventSink } from "./events.js";
import type { ControllerMetrics } from "./metrics.js";
import { evaluatePolicy, initialPolicyState, recordAction, type PolicyState } from "./policy.js";
import type { PolicyStore } from "./store.js";
import type { TargetManager } from "./docker-target.js";
import type { TelemetryMonitor } from "./telemetry.js";

interface VersionedState {
  version: number;
  state: PolicyState;
}

export class MapekController {
  private readonly states = new Map<string, VersionedState>();
  private blindMode = false;

  constructor(
    private readonly store: PolicyStore,
    private readonly targets: TargetManager,
    private readonly telemetry: TelemetryMonitor,
    private readonly events: ControllerEventSink,
    private readonly metrics: ControllerMetrics,
    private readonly logger: Logger
  ) {}

  async cycle(): Promise<number> {
    const stopTimer = this.metrics.cycleDuration.startTimer();
    try {
      const telemetry = await this.telemetry.observe();
      this.metrics.telemetryAvailable.set(telemetry.available ? 1 : 0);
      if (!telemetry.available && !this.blindMode) {
        this.blindMode = true;
        this.metrics.telemetryAlerts.inc({ reason: telemetry.reason });
        await this.events.record({
          event: "telemetry_unavailable",
          at: new Date(telemetry.observedAtMs).toISOString(),
          source: "controller",
          mode: "blind",
          fallback: "docker",
          reason: telemetry.reason,
          missing_jobs: telemetry.missingJobs
        });
        this.logger.warn(
          { reason: telemetry.reason, missingJobs: telemetry.missingJobs },
          "controller entered telemetry blind mode; using Docker state only"
        );
      } else if (telemetry.available && this.blindMode) {
        this.blindMode = false;
        await this.events.record({
          event: "telemetry_restored",
          at: new Date(telemetry.observedAtMs).toISOString(),
          source: "controller",
          monitored_jobs: telemetry.monitoredJobs
        });
        this.logger.info(
          { monitoredJobs: telemetry.monitoredJobs },
          "controller telemetry restored"
        );
      }

      const policies = await this.store.loadEnabled();
      for (const policy of policies) {
        const snapshot = await this.targets.observe(policy.targetService);
        this.metrics.targetRunning.set({ target: policy.targetService }, snapshot.running ? 1 : 0);
        const saved = this.states.get(policy.id);
        const previous = saved?.version === policy.version ? saved.state : initialPolicyState();
        const evaluation = evaluatePolicy(policy, snapshot, previous);
        this.states.set(policy.id, { version: policy.version, state: evaluation.state });

        if (evaluation.detected) {
          await this.events.record({
            event: "anomaly_detected",
            at: new Date(snapshot.observedAtMs).toISOString(),
            source: "controller",
            signal: "container_running",
            observed: snapshot.running ? 1 : 0,
            threshold: 1
          });
        }
        if (evaluation.blockedBy) {
          this.metrics.policyBlocks.inc({ policy: policy.id, reason: evaluation.blockedBy });
        }
        if (!evaluation.plan) continue;

        await this.events.record({
          event: "plan_selected",
          at: new Date().toISOString(),
          source: "controller",
          policy_id: policy.id,
          action: evaluation.plan,
          target: policy.targetService
        });
        let success = false;
        try {
          await this.targets.restartAndVerify(policy.targetService, 10_000);
          success = true;
          this.metrics.actions.inc({
            target: policy.targetService,
            action: evaluation.plan,
            result: "success"
          });
          this.logger.info(
            { policy: policy.id, target: policy.targetService },
            "controller action"
          );
        } catch (error) {
          this.metrics.actions.inc({
            target: policy.targetService,
            action: evaluation.plan,
            result: "failure"
          });
          this.logger.error({ error, policy: policy.id }, "controller action failed");
        } finally {
          await this.events.record({
            event: "action_executed",
            at: new Date().toISOString(),
            source: "controller",
            action: evaluation.plan,
            target: policy.targetService,
            success
          });
          this.states.set(policy.id, {
            version: policy.version,
            state: recordAction(evaluation.state, Date.now())
          });
        }
      }
      return Math.min(...policies.map(({ pollIntervalMs }) => pollIntervalMs), 1000);
    } finally {
      stopTimer();
    }
  }
}
