import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runSyntheticScenarioS001 } from "./synthetic-bug.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const outputPath = resolve(
  repositoryRoot,
  process.env.SYNTHETIC_OUTPUT ?? "docs/results/synthetic/S-001-non-idempotent-consumer.json"
);
const result = runSyntheticScenarioS001();

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ output: outputPath, ...result })}\n`);
