import { spawnSync } from "node:child_process";
import process from "node:process";

if (!process.env.DATABASE_URL) {
  process.loadEnvFile(".env.example");
}

const npmCli = process.env.npm_execpath;

if (!npmCli) {
  throw new Error("Run this bootstrap through npm so npm_execpath is available.");
}

const result = spawnSync(
  process.execPath,
  [npmCli, "run", "generate", "--workspace", "@chaos/database"],
  {
    env: process.env,
    stdio: "inherit"
  }
);

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
