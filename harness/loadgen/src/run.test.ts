import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runLoad } from "./run.js";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

describe("load generator cancellation", () => {
  it("cancels scheduled arrivals without issuing requests", async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "chaos-loadgen-abort-"));
    const controller = new AbortController();
    controller.abort(new Error("synthetic safety abort"));
    const summary = await runLoad({
      baseUrl: "http://127.0.0.1:1",
      seed: 99,
      durationSeconds: 30,
      ratePerSecond: 10,
      timeoutMs: 100,
      outputRoot: temporaryDirectory,
      signal: controller.signal
    });
    expect(summary.aborted).toBe(true);
    expect(summary.successful_operations).toBe(0);
    expect(summary.failed_operations).toBe(summary.scheduled_operations);
  });
});
