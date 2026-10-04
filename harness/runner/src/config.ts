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
    seed: z.number().int().nonnegative(),
    repeat: z.number().int().min(1).max(100),
    duration_s: z.number().int().min(1).max(3600),
    rate_per_second: z.number().positive().max(1000).default(10),
    invariant_drain_timeout_s: z.number().int().min(1).max(300).default(30),
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
    if (experiment.fs1 && experiment.fs1.inject_after_s >= experiment.duration_s) {
      context.addIssue({
        code: "custom",
        path: ["fs1", "inject_after_s"],
        message: "must occur before duration_s"
      });
    }
  });

export type Experiment = z.infer<typeof experimentSchema>;

export async function readExperiment(path: string): Promise<Experiment> {
  const document: unknown = parse(await readFile(path, "utf8"));
  return experimentSchema.parse(document);
}
