import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { z } from "zod";

const invariantSchema = z.enum(["I1", "I2", "I3", "I4", "I5", "I6"]);

export const experimentSchema = z
  .object({
    name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    hypothesis: z.string().min(10),
    target: z.string().min(1),
    fault: z.enum(["none", "FS_1", "FS_2", "FS_3", "FS_4"]),
    fs1: z
      .object({
        action: z.enum(["kill", "stop", "pause", "restart"]),
        inject_after_s: z.number().nonnegative()
      })
      .optional(),
    fs2: z
      .object({
        mode: z.enum(["spike", "drop", "freeze", "noise", "counter_reset"]),
        inject_after_s: z.number().nonnegative()
      })
      .optional(),
    fs3: z
      .object({
        action: z.literal("stop"),
        inject_after_s: z.number().nonnegative()
      })
      .optional(),
    fs4: z
      .object({
        proxy: z.enum(["api-postgres", "api-redis", "worker-sink"]),
        toxic: z.enum(["latency", "timeout", "reset_peer"]),
        stream: z.enum(["upstream", "downstream"]).default("downstream"),
        inject_after_s: z.number().nonnegative(),
        latency_ms: z.number().int().nonnegative().optional(),
        jitter_ms: z.number().int().nonnegative().default(0),
        timeout_ms: z.number().int().nonnegative().optional()
      })
      .optional(),
    conditions: z
      .object({
        sink_response_latency_ms: z.number().int().min(0).max(30_000).default(0)
      })
      .optional(),
    controller: z
      .object({
        enabled: z.boolean().default(false),
        port: z.number().int().min(1).max(65535).default(3100),
        restart_during_outage: z.boolean().default(false)
      })
      .default({ enabled: false, port: 3100, restart_during_outage: false }),
    seed: z.number().int().nonnegative(),
    repeat: z.number().int().min(1).max(100),
    duration_s: z.number().int().min(1).max(3600),
    rate_per_second: z.number().positive().max(1000).default(10),
    invariant_drain_timeout_s: z.number().int().min(1).max(300).default(30),
    duplicate_observation_s: z.number().int().min(0).max(300).default(0),
    max_duration_s: z.number().int().min(1).max(7200).default(600),
    recovery: z
      .object({
        timeout_s: z.number().int().min(1).max(600).default(30),
        consecutive_healthy: z.number().int().min(1).max(60).default(3)
      })
      .default({ timeout_s: 30, consecutive_healthy: 3 }),
    steady_state: z.object({
      max_error_rate: z.number().min(0).max(1)
    }),
    abort_if: z.object({
      error_rate_above: z.number().min(0).max(1)
    }),
    invariants: z.array(invariantSchema).min(1)
  })
  .superRefine((experiment, context) => {
    if (experiment.fault === "FS_1" && !experiment.fs1) {
      context.addIssue({ code: "custom", path: ["fs1"], message: "FS_1 requires fs1 options" });
    }
    if (experiment.fault !== "FS_1" && experiment.fs1) {
      context.addIssue({
        code: "custom",
        path: ["fs1"],
        message: "fs1 options are only valid for FS_1"
      });
    }
    if (experiment.fault === "FS_2" && !experiment.fs2) {
      context.addIssue({ code: "custom", path: ["fs2"], message: "FS_2 requires fs2 options" });
    }
    if (experiment.fault !== "FS_2" && experiment.fs2) {
      context.addIssue({
        code: "custom",
        path: ["fs2"],
        message: "fs2 options are only valid for FS_2"
      });
    }
    if (experiment.fault === "FS_2" && experiment.target !== "metrics-proxy") {
      context.addIssue({
        code: "custom",
        path: ["target"],
        message: "FS_2 target must be metrics-proxy"
      });
    }
    if (experiment.fault === "FS_3" && !experiment.fs3) {
      context.addIssue({ code: "custom", path: ["fs3"], message: "FS_3 requires fs3 options" });
    }
    if (experiment.fault !== "FS_3" && experiment.fs3) {
      context.addIssue({
        code: "custom",
        path: ["fs3"],
        message: "fs3 options are only valid for FS_3"
      });
    }
    if (experiment.fault === "FS_3" && experiment.target !== "metrics-proxy") {
      context.addIssue({
        code: "custom",
        path: ["target"],
        message: "FS_3 target must be metrics-proxy"
      });
    }
    if (experiment.fault === "FS_4" && !experiment.fs4) {
      context.addIssue({ code: "custom", path: ["fs4"], message: "FS_4 requires fs4 options" });
    }
    if (experiment.fault !== "FS_4" && experiment.fs4) {
      context.addIssue({
        code: "custom",
        path: ["fs4"],
        message: "fs4 options are only valid for FS_4"
      });
    }
    if (experiment.fs4?.toxic === "latency" && experiment.fs4.latency_ms === undefined) {
      context.addIssue({
        code: "custom",
        path: ["fs4", "latency_ms"],
        message: "latency toxic requires latency_ms"
      });
    }
    if (
      experiment.fs4 &&
      ["timeout", "reset_peer"].includes(experiment.fs4.toxic) &&
      experiment.fs4.timeout_ms === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["fs4", "timeout_ms"],
        message: `${experiment.fs4.toxic} toxic requires timeout_ms`
      });
    }
    if (experiment.fs1 && experiment.fs1.inject_after_s >= experiment.duration_s) {
      context.addIssue({
        code: "custom",
        path: ["fs1", "inject_after_s"],
        message: "must occur before duration_s"
      });
    }
    if (experiment.fs2 && experiment.fs2.inject_after_s >= experiment.duration_s) {
      context.addIssue({
        code: "custom",
        path: ["fs2", "inject_after_s"],
        message: "must occur before duration_s"
      });
    }
    if (experiment.fs3 && experiment.fs3.inject_after_s >= experiment.duration_s) {
      context.addIssue({
        code: "custom",
        path: ["fs3", "inject_after_s"],
        message: "must occur before duration_s"
      });
    }
    if (experiment.fs4 && experiment.fs4.inject_after_s >= experiment.duration_s) {
      context.addIssue({
        code: "custom",
        path: ["fs4", "inject_after_s"],
        message: "must occur before duration_s"
      });
    }
    if (experiment.controller.restart_during_outage) {
      if (!experiment.controller.enabled) {
        context.addIssue({
          code: "custom",
          path: ["controller", "enabled"],
          message: "controller restart during outage requires the controller to be enabled"
        });
      }
      if (
        experiment.fault !== "FS_1" ||
        experiment.target !== "payment-worker" ||
        !experiment.fs1 ||
        !["kill", "stop"].includes(experiment.fs1.action)
      ) {
        context.addIssue({
          code: "custom",
          path: ["controller", "restart_during_outage"],
          message:
            "controller restart during outage requires an FS_1 kill or stop of payment-worker"
        });
      }
    }
  });

export type Experiment = z.infer<typeof experimentSchema>;

export async function readExperiment(path: string): Promise<Experiment> {
  const document: unknown = parse(await readFile(path, "utf8"));
  return experimentSchema.parse(document);
}
