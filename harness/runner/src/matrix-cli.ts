import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readExperiment, type Experiment } from "./config.js";
import {
  buildMatrixAggregate,
  createMatrixArtifactDirectory,
  materializeMatrixExperiment,
  matrixRunReportSchema,
  readMatrixManifest,
  type MatrixEntry,
  type MatrixRunRecord,
  waitForMatrixReadiness,
  writeMatrixArtifacts
} from "./matrix.js";
import { MetricsProxyControlClient } from "./fs2.js";
import { ExperimentRunError, runExperiment } from "./runner.js";
import { assertLocalDockerHost } from "./safety.js";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const dryRun = process.argv.includes("--dry-run");
const manifestArgument = process.argv.slice(2).find((argument) => argument !== "--dry-run");
if (!manifestArgument) {
  throw new Error("Usage: npm run matrix --workspace @chaos/runner -- <matrix-manifest.yml>");
}

function resolveRepositoryPath(path: string): string {
  const resolved = resolve(repositoryRoot, path);
  const pathFromRoot = relative(repositoryRoot, resolved);
  if (pathFromRoot === "" || pathFromRoot.startsWith("..")) {
    throw new Error(`Matrix path must stay inside the repository: ${path}`);
  }
  return resolved;
}

function validateEntry(entry: MatrixEntry, experiment: Experiment): void {
  if (experiment.repeat !== 1) {
    throw new Error(`${entry.config} must use repeat: 1; the matrix owns repetition`);
  }
  if (experiment.fault === "none" && entry.injection_offset_s) {
    throw new Error(`${entry.config} is a control and cannot randomize injection offsets`);
  }
  if (experiment.fault !== "none" && !entry.injection_offset_s) {
    throw new Error(`${entry.config} requires injection_offset_s for varied fault timing`);
  }
  if (entry.injection_offset_s && entry.injection_offset_s.max >= experiment.duration_s) {
    throw new Error(`${entry.config} injection window must end before duration_s`);
  }
}

const manifestPath = resolveRepositoryPath(manifestArgument);
const manifest = await readMatrixManifest(manifestPath);
const loaded = await Promise.all(
  manifest.experiments.map(async (entry) => {
    const experiment = await readExperiment(resolveRepositoryPath(entry.config));
    validateEntry(entry, experiment);
    return { entry, experiment };
  })
);
const loadedFaults = new Set(loaded.map(({ experiment }) => experiment.fault));
const missingFaults = manifest.required_faults.filter((fault) => !loadedFaults.has(fault));
if (missingFaults.length > 0) {
  throw new Error(`Matrix manifest is missing required fault classes: ${missingFaults.join(", ")}`);
}
const names = loaded.map(({ experiment }) => experiment.name);
if (new Set(names).size !== names.length) {
  throw new Error("Matrix experiment names must be unique");
}

if (dryRun) {
  const experiments = loaded.map(({ entry, experiment }) => {
    const materialized = Array.from({ length: entry.repeats }, (_, repeatIndex) =>
      materializeMatrixExperiment(experiment, repeatIndex, entry.injection_offset_s)
    );
    return {
      config: entry.config,
      experiment: experiment.name,
      fault: experiment.fault,
      repeats: entry.repeats,
      seeds: materialized.map(({ experiment: run }) => run.seed),
      injection_offsets_s: materialized
        .map(({ injectionOffsetSeconds }) => injectionOffsetSeconds)
        .filter((offset): offset is number => offset !== null)
    };
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        dry_run: true,
        matrix: manifest.name,
        planned_runs: experiments.reduce((total, item) => total + item.repeats, 0),
        required_faults: manifest.required_faults,
        experiments,
        mutations_performed: 0
      },
      null,
      2
    )}\n`
  );
  process.exit(0);
}

assertLocalDockerHost();
const artifact = await createMatrixArtifactDirectory(repositoryRoot, manifest.name);
const records: MatrixRunRecord[] = [];
const progressPath = join(artifact.directory, "progress.json");
await writeFile(
  join(artifact.directory, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  { flag: "wx" }
);
const metricsProxy = new MetricsProxyControlClient(
  process.env.METRICS_PROXY_URL ?? "http://127.0.0.1:3003",
  process.env.METRICS_PROXY_CHAOS_TOKEN ?? "local-chaos-control-token"
);

async function endpointReady(url: string): Promise<boolean> {
  const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
  return response.ok;
}

async function suiteReady(): Promise<boolean> {
  const [api, metrics, sink, relay, prometheus, metricsMode] = await Promise.all([
    endpointReady(`${process.env.PAYMENT_API_URL ?? "http://127.0.0.1:3000"}/readyz`),
    endpointReady(`${process.env.METRICS_PROXY_URL ?? "http://127.0.0.1:3003"}/healthz`),
    endpointReady(`${process.env.WEBHOOK_SINK_URL ?? "http://127.0.0.1:3002"}/healthz`),
    endpointReady(`${process.env.OUTBOX_RELAY_URL ?? "http://127.0.0.1:3004"}/readyz`),
    endpointReady(`${process.env.PROMETHEUS_URL ?? "http://127.0.0.1:19090"}/-/ready`),
    metricsProxy.readMode()
  ]);
  return api && metrics && sink && relay && prometheus && metricsMode === "none";
}

await waitForMatrixReadiness(suiteReady);

for (const { entry, experiment: source } of loaded) {
  for (let repeatIndex = 0; repeatIndex < entry.repeats; repeatIndex += 1) {
    const materialized = materializeMatrixExperiment(source, repeatIndex, entry.injection_offset_s);
    let runId: string;
    try {
      runId = await runExperiment({
        experiment: materialized.experiment,
        repositoryRoot,
        paymentApiUrl: process.env.PAYMENT_API_URL ?? "http://127.0.0.1:3000",
        prometheusUrl: process.env.PROMETHEUS_URL ?? "http://127.0.0.1:19090",
        databaseUrl:
          process.env.DATABASE_URL ?? "postgresql://chaos:chaos@127.0.0.1:5432/chaos_harness",
        redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6380",
        sinkUrl: process.env.WEBHOOK_SINK_URL ?? "http://127.0.0.1:3002",
        toxiproxyUrl: process.env.TOXIPROXY_URL ?? "http://127.0.0.1:8474",
        metricsProxyUrl: process.env.METRICS_PROXY_URL ?? "http://127.0.0.1:3003",
        outboxRelayUrl: process.env.OUTBOX_RELAY_URL ?? "http://127.0.0.1:3004",
        metricsProxyChaosToken:
          process.env.METRICS_PROXY_CHAOS_TOKEN ?? "local-chaos-control-token",
        iteration: 0
      });
    } catch (error) {
      if (!(error instanceof ExperimentRunError)) throw error;
      runId = error.runId;
    }
    const rawReport: unknown = JSON.parse(
      await readFile(
        join(repositoryRoot, "docs", "results", "experiments", runId, "report.json"),
        "utf8"
      )
    );
    records.push({
      config: entry.config,
      repeat_index: repeatIndex,
      injection_offset_s: materialized.injectionOffsetSeconds,
      report: matrixRunReportSchema.parse(rawReport)
    });
    await writeFile(
      progressPath,
      `${JSON.stringify(
        {
          matrix: manifest.name,
          planned_runs: manifest.experiments.reduce((total, item) => total + item.repeats, 0),
          completed_runs: records.length,
          run_ids: records.map(({ report }) => report.run_id)
        },
        null,
        2
      )}\n`
    );
    process.stdout.write(
      `${JSON.stringify({ matrix: manifest.name, completed_runs: records.length, run_id: runId })}\n`
    );
    await waitForMatrixReadiness(suiteReady);
  }
}

const aggregate = buildMatrixAggregate(manifest, records);
await writeMatrixArtifacts(artifact.directory, aggregate);
process.stdout.write(
  `${JSON.stringify(
    {
      matrix_run_id: artifact.runId,
      artifact_directory: relative(repositoryRoot, artifact.directory),
      status: aggregate.status,
      outcome: aggregate.outcome,
      totals: aggregate.totals
    },
    null,
    2
  )}\n`
);
if (!aggregate.coverage.complete) process.exitCode = 1;
else if (aggregate.totals.failed_runs > 0) process.exitCode = 2;
