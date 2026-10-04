import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { JournalEntry } from "./types.js";

const journalEntrySchema = z.object({
  run_id: z.string().min(1),
  key: z.string().min(1),
  request_hash: z.string().min(1),
  attempt: z.number().int().positive(),
  status: z.number().int().nullable(),
  payment_id: z.string().uuid().nullable()
});

export async function readJournal(path: string): Promise<JournalEntry[]> {
  const content = await readFile(path, "utf8");
  return content
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line, index) => {
      const parsed: unknown = JSON.parse(line);
      const result = journalEntrySchema.safeParse(parsed);
      if (!result.success) {
        throw new Error(`Invalid journal entry at line ${index + 1}: ${result.error.message}`);
      }
      return result.data;
    });
}

export function successfulJournalEntries(journal: JournalEntry[]): JournalEntry[] {
  return journal.filter(
    (entry) => entry.status !== null && entry.status >= 200 && entry.status < 300
  );
}
