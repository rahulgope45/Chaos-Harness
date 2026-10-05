import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { experimentSchema, type Experiment } from "./config.js";
import { responseResultSchema } from "./response-tracker.js";

const faultSchema = z.enum(["none", "FS_1", "FS_2", "FS_3", "FS_4"]);
const invariantSchema = z.enum(["I1", "I2", "I3", "I4", "I5", "I6"]);
const invariantStatusSchema = z.enum(["pass", "report", "fail"]);

const injectionOffsetWindowSchema = z
  .object({
    min: z.number().nonnegative(),
    max: z.number().positive()
  })
  .refine(({ min, max }) => max > min, "injection offset max must be greater than min");

export const matrixManifestSchema = z
  .object({
    schema_version: z.literal(1),
    name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    minimum_repeats: z.number().int().min(10).default(10),
    required_faults: z.array(faultSchema).min(1).default(["none", "FS_1", "FS_2", "FS_3", "FS_4"]),
    experiments: z
      .array(
        z.object({
          config: z.string().min(1),
          repeats: z.number().int().min(10).max(100),
          injection_offset_s: injectionOffsetWindowSchema.optional()
        })
      )
      .min(1)
  })
  .superRefine((manifest, context) => {
    const configs = new Set<string>();
    for (const [index, entry] of manifest.experiments.entries()) {
      if (configs.has(entry.config)) {
        context.addIssue({
          code: "custom",
          path: ["experiments", index, "config"],
          message: "matrix experiment configs must be unique"
        });
      }
      configs.add(entry.config);
      if (entry.repeats < manifest.minimum_repeats) {
        context.addIssue({
          code: "custom",
          path: ["experiments", index, "repeats"],
          message: `must be at least minimum_repeats (${manifest.minimum_repeats})`
        });
      }
    }
    if (new Set(manifest.required_faults).size !== manifest.required_faults.length) {
      context.addIssue({
        code: "custom",
        path: ["required_faults"],
        message: "required fault classes must be unique"
      });
    }
  });

export type MatrixManifest = z.infer<typeof matrixManifestSchema>;
export type MatrixEntry = MatrixManifest["experiments"][number];

export const matrixRunReportSchema = z.object({
  run_id: z.string().min(1),
  experiment: z.string().min(1),
  fault: faultSchema,
  seed: z.number().int().nonnegative(),
  response: responseResultSchema,
  load: z
    .object({
      client_p95_ms: z.number().nonnegative(),
      successful_operations: z.number().int().nonnegative(),
      failed_operations: z.number().int().nonnegative()
    })
    .passthrough()
    .nullable(),
  invariants: z.array(
    z
      .object({
        invariant: invariantSchema,
        status: invariantStatusSchema
      })
      .passthrough()
  ),
  status: z.enum(["passed", "failed"]),
  error: z.string().optional()
});

export type MatrixRunReport = z.infer<typeof matrixRunReportSchema>;

export interface MatrixRunRecord {
  config: string;
  repeat_index: number;
  injection_offset_s: number | null;
  report: MatrixRunReport;
}

export interface NumericSummary {
  sample_count: number;
  missing_count: number;
  median: number | null;
  p90: number | null;
  min: number | null;
  max: number | null;
}

function deterministicRandom(seed: number): number {
  let value = seed >>> 0;
  value += 0x6d2b79f5;
  let result = value;
  result = Math.imul(result ^ (result >>> 15), result | 1);
  result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
  return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
}

export function selectInjectionOffset(
  seed: number,
  repeatIndex: number,
  window: z.infer<typeof injectionOffsetWindowSchema>
): number {
  const random = deterministicRandom((seed + Math.imul(repeatIndex + 1, 0x9e3779b1)) >>> 0);
  return Math.round((window.min + random * (window.max - window.min)) * 1000) / 1000;
}

function setInjectionOffset(experiment: Experiment, offset: number): void {
  switch (experiment.fault) {
    case "FS_1":
      if (!experiment.fs1) throw new Error("FS-1 options are unavailable");
      experiment.fs1.inject_after_s = offset;
      return;
    case "FS_2":
      if (!experiment.fs2) throw new Error("FS-2 options are unavailable");
      experiment.fs2.inject_after_s = offset;
      return;
    case "FS_3":
      if (!experiment.fs3) throw new Error("FS-3 options are unavailable");
      experiment.fs3.inject_after_s = offset;
      return;
    case "FS_4":
      if (!experiment.fs4) throw new Error("FS-4 options are unavailable");
      experiment.fs4.inject_after_s = offset;
      return;
    case "none":
      throw new Error("Control experiments cannot have an injection offset window");
  }
}

export function materializeMatrixExperiment(
  source: Experiment,
  repeatIndex: number,
  window?: z.infer<typeof injectionOffsetWindowSchema>
): { experiment: Experiment; injectionOffsetSeconds: number | null } {
  if (!Number.isInteger(repeatIndex) || repeatIndex < 0) {
    throw new Error("repeat index must be a non-negative integer");
  }
  const experiment = structuredClone(source);
  experiment.seed = source.seed + repeatIndex;
  experiment.repeat = 1;
  if (!window) {
    if (experiment.fault !== "none") {
      throw new Error(`${experiment.name} requires an injection offset window`);
    }
    return { experiment: experimentSchema.parse(experiment), injectionOffsetSeconds: null };
  }
  if (experiment.fault === "none") {
    throw new Error("Control experiments cannot have an injection offset window");
  }
  const offset = selectInjectionOffset(source.seed, repeatIndex, window);
  if (offset >= experiment.duration_s) {
    throw new Error(
      `${experiment.name} injection offset ${offset} must be before duration ${experiment.duration_s}`
    );
  }
  setInjectionOffset(experiment, offset);
  return {
    experiment: experimentSchema.parse(experiment),
    injectionOffsetSeconds: offset
  };
}

export async function readMatrixManifest(path: string): Promise<MatrixManifest> {
  const document: unknown = parse(await readFile(path, "utf8"));
  return matrixManifestSchema.parse(document);
}

export async function waitForMatrixReadiness(
  probe: () => Promise<boolean>,
  options: { timeoutMs?: number; pollMs?: number } = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const pollMs = options.pollMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() <= deadline) {
    try {
      if (await probe()) return;
      lastError = undefined;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error("Matrix services did not become ready between runs", {
    ...(lastError === undefined ? {} : { cause: lastError })
  });
}

export function summarizeNumbers(values: Array<number | null>, total: number): NumericSummary {
  const sorted = values.filter((value): value is number => value !== null).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return {
      sample_count: 0,
      missing_count: total,
      median: null,
      p90: null,
      min: null,
      max: null
    };
  }
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? null);
  const p90Index = Math.max(0, Math.ceil(sorted.length * 0.9) - 1);
  return {
    sample_count: sorted.length,
    missing_count: Math.max(0, total - sorted.length),
    median,
    p90: sorted[p90Index] ?? null,
    min: sorted[0] ?? null,
    max: sorted.at(-1) ?? null
  };
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 1_000_000) / 1_000_000;
}

const faultOrder: Array<z.infer<typeof faultSchema>> = ["none", "FS_1", "FS_2", "FS_3", "FS_4"];

export function buildMatrixAggregate(
  manifest: MatrixManifest,
  records: MatrixRunRecord[],
  generatedAt = new Date().toISOString()
) {
  const experimentRows = manifest.experiments.map((entry) => {
    const matching = records.filter(({ config }) => config === entry.config);
    const offsets = matching
      .map(({ injection_offset_s }) => injection_offset_s)
      .filter((offset): offset is number => offset !== null);
    return {
      config: entry.config,
      experiment: matching[0]?.report.experiment ?? null,
      fault: matching[0]?.report.fault ?? null,
      planned_runs: entry.repeats,
      completed_runs: matching.length,
      passed_runs: matching.filter(({ report }) => report.status === "passed").length,
      failed_runs: matching.filter(({ report }) => report.status === "failed").length,
      seeds: matching.map(({ report }) => report.seed),
      injection_offsets_s: offsets,
      distinct_injection_offsets: new Set(offsets).size,
      run_ids: matching.map(({ report }) => report.run_id)
    };
  });
  const observedFaults = new Set(records.map(({ report }) => report.fault));
  const missingFaults = manifest.required_faults.filter((fault) => !observedFaults.has(fault));
  const incompleteExperiments = experimentRows
    .filter(({ planned_runs, completed_runs }) => planned_runs !== completed_runs)
    .map(({ config }) => config);
  const unvariedOffsets = experimentRows
    .filter(
      ({ fault, completed_runs, distinct_injection_offsets }) =>
        fault !== null && fault !== "none" && completed_runs > 1 && distinct_injection_offsets < 2
    )
    .map(({ config }) => config);

  const faultClasses = faultOrder
    .filter((fault) => observedFaults.has(fault) || manifest.required_faults.includes(fault))
    .map((fault) => {
      const matching = records.filter(({ report }) => report.fault === fault);
      const invariants = Object.fromEntries(
        invariantSchema.options.map((invariant) => {
          const statuses = matching.flatMap(({ report }) =>
            report.invariants
              .filter((result) => result.invariant === invariant)
              .map((result) => result.status)
          );
          const pass = statuses.filter((status) => status === "pass").length;
          const reportOnly = statuses.filter((status) => status === "report").length;
          const fail = statuses.filter((status) => status === "fail").length;
          return [
            invariant,
            {
              observed_runs: statuses.length,
              pass_count: pass,
              report_count: reportOnly,
              fail_count: fail,
              pass_rate: ratio(pass, statuses.length),
              non_failure_rate: ratio(pass + reportOnly, statuses.length)
            }
          ];
        })
      );
      return {
        fault,
        run_count: matching.length,
        passed_runs: matching.filter(({ report }) => report.status === "passed").length,
        failed_runs: matching.filter(({ report }) => report.status === "failed").length,
        mttd_ms: summarizeNumbers(
          matching.map(({ report }) => report.response.durations_ms.mttd),
          matching.length
        ),
        mttr_ms: summarizeNumbers(
          matching.map(({ report }) => report.response.durations_ms.mttr),
          matching.length
        ),
        client_p95_ms: summarizeNumbers(
          matching.map(({ report }) => report.load?.client_p95_ms ?? null),
          matching.length
        ),
        invariants
      };
    });

  const coverageComplete =
    missingFaults.length === 0 &&
    incompleteExperiments.length === 0 &&
    unvariedOffsets.length === 0 &&
    experimentRows.every(({ completed_runs }) => completed_runs >= manifest.minimum_repeats);
  const failedRuns = records.filter(({ report }) => report.status === "failed").length;
  return {
    schema_version: 1 as const,
    matrix: manifest.name,
    generated_at: generatedAt,
    minimum_repeats: manifest.minimum_repeats,
    status: coverageComplete ? ("complete" as const) : ("incomplete" as const),
    outcome: failedRuns === 0 ? ("all_passed" as const) : ("failures_observed" as const),
    coverage: {
      required_faults: manifest.required_faults,
      observed_faults: faultOrder.filter((fault) => observedFaults.has(fault)),
      missing_faults: missingFaults,
      incomplete_experiments: incompleteExperiments,
      unvaried_injection_offsets: unvariedOffsets,
      complete: coverageComplete
    },
    totals: {
      planned_runs: manifest.experiments.reduce((total, entry) => total + entry.repeats, 0),
      completed_runs: records.length,
      passed_runs: records.length - failedRuns,
      failed_runs: failedRuns
    },
    definitions: {
      median: "middle value; arithmetic mean of the two middle values for an even sample count",
      p90: "nearest-rank 90th percentile",
      missing_timings:
        "null timings are excluded from statistics and counted as missing, never zero",
      invariant_pass_rate: "pass_count / observed_runs",
      invariant_non_failure_rate: "(pass_count + report_count) / observed_runs"
    },
    experiments: experimentRows,
    fault_classes: faultClasses,
    runs: records.map(({ config, repeat_index, injection_offset_s, report }) => ({
      run_id: report.run_id,
      config,
      experiment: report.experiment,
      fault: report.fault,
      repeat_index,
      seed: report.seed,
      injection_offset_s,
      status: report.status,
      error: report.error ?? null,
      mttd_ms: report.response.durations_ms.mttd,
      mttr_ms: report.response.durations_ms.mttr,
      client_p95_ms: report.load?.client_p95_ms ?? null
    }))
  };
}

export type MatrixAggregate = ReturnType<typeof buildMatrixAggregate>;

function displayMetric(summary: NumericSummary): string {
  if (summary.sample_count === 0) return `— (0 samples, ${summary.missing_count} missing)`;
  const missing = summary.missing_count > 0 ? `, ${summary.missing_count} missing` : "";
  return `${summary.median} / ${summary.p90} / ${summary.min} / ${summary.max} (${summary.sample_count} samples${missing})`;
}

export function renderMatrixMarkdown(aggregate: MatrixAggregate): string {
  const lines = [
    `# ${aggregate.matrix} aggregate report`,
    "",
    `Generated: ${aggregate.generated_at}`,
    "",
    `Coverage: **${aggregate.status}**. Outcome: **${aggregate.outcome}**. Completed ${aggregate.totals.completed_runs}/${aggregate.totals.planned_runs} runs.`,
    "",
    "MTTD and MTTR cells show median / p90 / min / max in milliseconds. Null timings are missing samples, not zero-duration responses.",
    "",
    "## Experiment coverage",
    "",
    "| Experiment | Fault | Planned | Completed | Passed | Failed | Distinct offsets |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |"
  ];
  for (const experiment of aggregate.experiments) {
    lines.push(
      `| ${experiment.experiment ?? experiment.config} | ${experiment.fault ?? "—"} | ${experiment.planned_runs} | ${experiment.completed_runs} | ${experiment.passed_runs} | ${experiment.failed_runs} | ${experiment.distinct_injection_offsets} |`
    );
  }
  lines.push(
    "",
    "## Response statistics by fault class",
    "",
    "| Fault | Runs | MTTD ms | MTTR ms | Client p95 ms |",
    "| --- | ---: | --- | --- | --- |"
  );
  for (const fault of aggregate.fault_classes) {
    lines.push(
      `| ${fault.fault} | ${fault.run_count} | ${displayMetric(fault.mttd_ms)} | ${displayMetric(fault.mttr_ms)} | ${displayMetric(fault.client_p95_ms)} |`
    );
  }
  lines.push(
    "",
    "## Invariant outcomes by fault class",
    "",
    "| Fault | Invariant | Observed | Pass | Report-only | Fail | Pass rate | Non-failure rate |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |"
  );
  for (const fault of aggregate.fault_classes) {
    for (const [invariant, result] of Object.entries(fault.invariants)) {
      lines.push(
        `| ${fault.fault} | ${invariant} | ${result.observed_runs} | ${result.pass_count} | ${result.report_count} | ${result.fail_count} | ${result.pass_rate ?? "—"} | ${result.non_failure_rate ?? "—"} |`
      );
    }
  }
  lines.push(
    "",
    "## Evidence run IDs",
    "",
    ...aggregate.experiments.flatMap((experiment) => [
      `### ${experiment.experiment ?? experiment.config}`,
      "",
      ...experiment.run_ids.map((runId) => `- \`${runId}\``),
      ""
    ]),
    "Control runs have no injected fault, so MTTD and MTTR are not applicable. Telemetry corruption and outage modes remain deliberate fault injections and are not genuine defect findings.",
    ""
  );
  return lines.join("\n");
}

export async function createMatrixArtifactDirectory(repositoryRoot: string, matrixName: string) {
  const runId = `${matrixName}-${new Date().toISOString().replace(/[:.]/gu, "-")}-${randomUUID().slice(0, 8)}`;
  const directory = join(repositoryRoot, "docs", "results", "matrices", runId);
  await mkdir(directory, { recursive: true });
  return { runId, directory };
}

export async function writeMatrixArtifacts(
  directory: string,
  aggregate: MatrixAggregate
): Promise<void> {
  await writeFile(join(directory, "aggregate.json"), `${JSON.stringify(aggregate, null, 2)}\n`, {
    flag: "wx"
  });
  await writeFile(join(directory, "summary.md"), renderMatrixMarkdown(aggregate), { flag: "wx" });
}
