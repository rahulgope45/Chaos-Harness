import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { z } from "zod";

const invariantSchema = z.enum(["I1", "I2", "I3", "I4", "I5", "I6"]);

export const experimentSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  hypothesis: z.string().min(10),
  target: z.string().min(1),
  fault: z.enum(["none", "FS_1", "FS_2", "FS_3", "FS_4"]),
  seed: z.number().int().nonnegative(),
  repeat: z.number().int().min(1).max(100),
  duration_s: z.number().int().min(1).max(3600),
  rate_per_second: z.number().positive().max(1000).default(10),
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
});

export type Experiment = z.infer<typeof experimentSchema>;

export async function readExperiment(path: string): Promise<Experiment> {
  const document: unknown = parse(await readFile(path, "utf8"));
  return experimentSchema.parse(document);
}
