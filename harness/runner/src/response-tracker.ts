import { appendFile, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";

const eventBase = {
  run_id: z.string().min(1),
  at: z.string().datetime(),
  source: z.enum(["runner", "controller"])
};

export const responseEventSchema = z.discriminatedUnion("event", [
  z.object({
    ...eventBase,
    event: z.literal("fault_injected"),
    fault: z.enum(["FS_1", "FS_2", "FS_3", "FS_4"]),
    action: z.string().min(1),
    target: z.string().min(1)
  }),
  z.object({
    ...eventBase,
    event: z.literal("anomaly_detected"),
    signal: z.string().min(1),
    observed: z.number().nullable(),
    threshold: z.number().nullable()
  }),
  z.object({
    ...eventBase,
    event: z.literal("plan_selected"),
    policy_id: z.string().min(1),
    action: z.string().min(1),
    target: z.string().min(1)
  }),
  z.object({
    ...eventBase,
    event: z.literal("action_executed"),
    action: z.string().min(1),
    target: z.string().min(1),
    success: z.boolean()
  }),
  z.object({
    ...eventBase,
    event: z.literal("telemetry_unavailable"),
    mode: z.literal("blind"),
    fallback: z.literal("docker"),
    reason: z.enum(["missing_or_down_targets", "prometheus_unavailable"]),
    missing_jobs: z.array(z.string().min(1)).min(1)
  }),
  z.object({
    ...eventBase,
    event: z.literal("telemetry_restored"),
    monitored_jobs: z.array(z.string().min(1)).min(1)
  }),
  z.object({
    ...eventBase,
    event: z.literal("telemetry_invalid"),
    mode: z.literal("guarded"),
    fallback: z.literal("docker"),
    issues: z
      .array(
        z.object({
          reason: z.enum([
            "missing_required_series",
            "out_of_bounds",
            "stale_sample",
            "counter_reset",
            "invalid_sample"
          ]),
          metric: z.string().min(1)
        })
      )
      .min(1)
  }),
  z.object({
    ...eventBase,
    event: z.literal("telemetry_validated"),
    monitored_metrics: z.array(z.string().min(1)).min(1)
  }),
  z.object({
    ...eventBase,
    event: z.literal("recovered"),
    observed_error_rate: z.number().min(0),
    max_error_rate: z.number().min(0),
    consecutive_healthy: z.number().int().positive()
  })
]);

export type ResponseEvent = z.infer<typeof responseEventSchema>;
type WithoutRunId<T> = T extends ResponseEvent ? Omit<T, "run_id"> : never;
export type ResponseEventInput = WithoutRunId<ResponseEvent>;

const nullableTimestamp = z.string().datetime().nullable();
const nullableDuration = z.number().nonnegative().nullable();

export const responseResultSchema = z.object({
  schema_version: z.literal(1),
  run_id: z.string().min(1),
  definitions: z.object({
    mttd: z.literal("anomaly_detected.at - fault_injected.at"),
    mttr: z.literal("recovered.at - fault_injected.at")
  }),
  recovery_bound: z.object({
    max_error_rate: z.number().min(0),
    consecutive_healthy: z.number().int().positive(),
    sample_interval_ms: z.number().int().positive()
  }),
  timestamps: z.object({
    fault_injected_at: nullableTimestamp,
    anomaly_detected_at: nullableTimestamp,
    plan_selected_at: nullableTimestamp,
    action_executed_at: nullableTimestamp,
    recovered_at: nullableTimestamp
  }),
  durations_ms: z.object({
    mttd: nullableDuration,
    mttr: nullableDuration,
    detection_to_plan: nullableDuration,
    plan_to_action: nullableDuration,
    action_to_recovery: nullableDuration
  }),
  events: z.array(responseEventSchema)
});

export type ResponseResult = z.infer<typeof responseResultSchema>;

interface RecoveryBound {
  maxErrorRate: number;
  consecutiveHealthy: number;
  sampleIntervalMs: number;
}

function firstEvent<T extends ResponseEvent["event"]>(
  events: ResponseEvent[],
  event: T
): Extract<ResponseEvent, { event: T }> | undefined {
  return events.find(
    (candidate): candidate is Extract<ResponseEvent, { event: T }> => candidate.event === event
  );
}

function elapsed(
  start: ResponseEvent | undefined,
  end: ResponseEvent | undefined,
  label: string
): number | null {
  if (!start || !end) return null;
  const duration = Date.parse(end.at) - Date.parse(start.at);
  if (duration < 0) throw new Error(`${label} events are out of order`);
  return duration;
}

export function buildResponseResult(
  runId: string,
  rawEvents: ResponseEvent[],
  recoveryBound: RecoveryBound
): ResponseResult {
  const events = rawEvents.map((event) => responseEventSchema.parse(event));
  if (events.some((event) => event.run_id !== runId)) {
    throw new Error("Response events contain more than one run ID");
  }
  const fault = firstEvent(events, "fault_injected");
  const detected = firstEvent(events, "anomaly_detected");
  const planned = firstEvent(events, "plan_selected");
  const action = firstEvent(events, "action_executed");
  const recovered = firstEvent(events, "recovered");

  return responseResultSchema.parse({
    schema_version: 1,
    run_id: runId,
    definitions: {
      mttd: "anomaly_detected.at - fault_injected.at",
      mttr: "recovered.at - fault_injected.at"
    },
    recovery_bound: {
      max_error_rate: recoveryBound.maxErrorRate,
      consecutive_healthy: recoveryBound.consecutiveHealthy,
      sample_interval_ms: recoveryBound.sampleIntervalMs
    },
    timestamps: {
      fault_injected_at: fault?.at ?? null,
      anomaly_detected_at: detected?.at ?? null,
      plan_selected_at: planned?.at ?? null,
      action_executed_at: action?.at ?? null,
      recovered_at: recovered?.at ?? null
    },
    durations_ms: {
      mttd: elapsed(fault, detected, "MTTD"),
      mttr: elapsed(fault, recovered, "MTTR"),
      detection_to_plan: elapsed(detected, planned, "Detection-to-plan"),
      plan_to_action: elapsed(planned, action, "Plan-to-action"),
      action_to_recovery: elapsed(action, recovered, "Action-to-recovery")
    },
    events
  });
}

export class ResponseEventLog {
  private constructor(
    private readonly runId: string,
    private readonly path: string
  ) {}

  static async create(runId: string, path: string): Promise<ResponseEventLog> {
    await writeFile(path, "", { flag: "wx" });
    return new ResponseEventLog(runId, path);
  }

  async record(input: ResponseEventInput): Promise<ResponseEvent> {
    const event = responseEventSchema.parse({ run_id: this.runId, ...input });
    await appendFile(this.path, `${JSON.stringify(event)}\n`);
    return event;
  }

  async read(): Promise<ResponseEvent[]> {
    const content = await readFile(this.path, "utf8");
    if (content.trim().length === 0) return [];
    return content
      .trimEnd()
      .split("\n")
      .map((line) => responseEventSchema.parse(JSON.parse(line) as unknown));
  }
}
