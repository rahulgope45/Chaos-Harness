import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { runLoad } from "./run.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const summary = await runLoad({
  baseUrl: process.env.LOADGEN_BASE_URL ?? "http://127.0.0.1:3000",
  seed: Number(process.env.LOADGEN_SEED ?? 42),
  durationSeconds: Number(process.env.LOADGEN_DURATION_SECONDS ?? 10),
  ratePerSecond: Number(process.env.LOADGEN_RATE_PER_SECOND ?? 10),
  timeoutMs: Number(process.env.LOADGEN_TIMEOUT_MS ?? 2000),
  outputRoot: process.env.LOADGEN_OUTPUT_ROOT
    ? resolve(process.env.LOADGEN_OUTPUT_ROOT)
    : resolve(repositoryRoot, "docs/results/baseline")
});

process.stdout.write(`${JSON.stringify(summary)}\n`);
