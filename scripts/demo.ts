import { spawnSync } from "node:child_process";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://chaos:chaos@127.0.0.1:5432/chaos_harness";
const experiment = process.argv[2] ?? process.env.DEMO_EXPERIMENT ?? "experiments/ci-smoke.yml";
const configuredNpmCli = process.env.npm_execpath;
if (!configuredNpmCli) throw new Error("Run this launcher through `npm run demo`");
const npmCli: string = configuredNpmCli;

function run(command: string, args: string[], extraEnv: NodeJS.ProcessEnv = {}): void {
  process.stdout.write(`\n> ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function runNpm(args: string[], extraEnv: NodeJS.ProcessEnv = {}): void {
  run(process.execPath, [npmCli, ...args], extraEnv);
}

run("docker", ["compose", "up", "-d", "--wait", "postgres", "redis", "toxiproxy"]);
runNpm(["run", "generate", "--workspace", "@chaos/database"], {
  DATABASE_URL: databaseUrl
});
runNpm(["run", "migrate:deploy", "--workspace", "@chaos/database"], {
  DATABASE_URL: databaseUrl
});
run("docker", ["compose", "up", "--build", "-d", "--wait", "--wait-timeout", "180"]);
runNpm(["run", "start", "--workspace", "@chaos/runner", "--", experiment], {
  DATABASE_URL: databaseUrl
});

process.stdout.write(
  "\nDemo completed. The stack remains running for inspection; use `docker compose down` when finished.\n"
);
