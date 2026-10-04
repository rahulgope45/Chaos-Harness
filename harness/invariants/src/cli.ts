import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exitCodeFor, runInvariantChecks } from "./checker.js";
import { readJournal } from "./journal.js";
import { LiveInvariantSource } from "./live-source.js";

const journalPath = process.env.INVARIANT_JOURNAL;
if (!journalPath) throw new Error("INVARIANT_JOURNAL must point to a run journal.jsonl");

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const fromRepositoryRoot = (path: string) => resolve(repositoryRoot, path);
const faultInjected = process.env.INVARIANT_FAULT_INJECTED === "true";
const duplicatePolicy = process.env.INVARIANT_I6_POLICY === "fail" ? "fail" : "report";
const source = new LiveInvariantSource(
  process.env.DATABASE_URL ?? "postgresql://chaos:chaos@127.0.0.1:5432/chaos_harness",
  process.env.REDIS_URL ?? "redis://127.0.0.1:6380"
);

try {
  const results = await runInvariantChecks(source, {
    journal: await readJournal(fromRepositoryRoot(journalPath)),
    faultInjected,
    duplicatePolicy,
    drainTimeoutMs: Number(process.env.INVARIANT_DRAIN_TIMEOUT_MS ?? 5000)
  });
  const report = `${JSON.stringify(results, null, 2)}\n`;
  const outputPath = process.env.INVARIANT_OUTPUT;
  if (outputPath) {
    const resolvedOutput = fromRepositoryRoot(outputPath);
    await mkdir(dirname(resolvedOutput), { recursive: true });
    await writeFile(resolvedOutput, report, { flag: "wx" });
  }
  process.stdout.write(report);
  process.exitCode = exitCodeFor(results);
} finally {
  await source.close();
}
