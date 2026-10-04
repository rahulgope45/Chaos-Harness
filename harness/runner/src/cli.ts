import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readExperiment } from "./config.js";
import { runExperiment } from "./runner.js";
import { assertLocalDockerHost, resolveAllowedTarget } from "./safety.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const dryRun = process.argv.includes("--dry-run");
const configPath = process.argv.slice(2).find((argument) => argument !== "--dry-run");
if (!configPath)
  throw new Error("Usage: npm run start --workspace @chaos/runner -- <experiment.yml>");

const experiment = await readExperiment(resolve(repositoryRoot, configPath));
assertLocalDockerHost();
if (dryRun) {
  const target = await resolveAllowedTarget(experiment.target);
  process.stdout.write(
    `${JSON.stringify({ dry_run: true, experiment, target, mutations_performed: 0 }, null, 2)}\n`
  );
  process.exit(0);
}
const runIds: string[] = [];
for (let iteration = 0; iteration < experiment.repeat; iteration += 1) {
  runIds.push(
    await runExperiment({
      experiment,
      repositoryRoot,
      paymentApiUrl: process.env.PAYMENT_API_URL ?? "http://127.0.0.1:3000",
      prometheusUrl: process.env.PROMETHEUS_URL ?? "http://127.0.0.1:19090",
      databaseUrl:
        process.env.DATABASE_URL ?? "postgresql://chaos:chaos@127.0.0.1:5432/chaos_harness",
      redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6380",
      iteration
    })
  );
}
process.stdout.write(`${JSON.stringify({ experiment: experiment.name, run_ids: runIds })}\n`);
