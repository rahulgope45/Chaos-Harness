import { describe, expect, it, vi } from "vitest";
import { type Fs1Container } from "./fs1.js";
import { injectFs3SensorStop } from "./fs3.js";
import { SafetySession, type TargetIdentity } from "./safety.js";

function target(service: string): TargetIdentity {
  return { id: `${service}-id`, service, labels: { "chaos-target": "true" } };
}

function fakeContainer(): {
  container: Fs1Container;
  state: { Running: boolean; Paused: boolean };
} {
  const state = { Running: true, Paused: false };
  return {
    state,
    container: {
      inspect: vi.fn(async () => ({ State: { ...state } })),
      kill: vi.fn(async () => undefined),
      stop: vi.fn(async () => void (state.Running = false)),
      pause: vi.fn(async () => undefined),
      unpause: vi.fn(async () => undefined),
      restart: vi.fn(async () => undefined),
      start: vi.fn(async () => void (state.Running = true))
    }
  };
}

describe("FS-3 sensor stop", () => {
  it("stops and restores only the metrics proxy", async () => {
    const fixture = fakeContainer();
    const safety = new SafetySession(10_000);
    await injectFs3SensorStop(target("metrics-proxy"), safety, fixture.container);
    expect(fixture.state.Running).toBe(false);
    await safety.cleanup();
    expect(fixture.state.Running).toBe(true);
  });

  it("rejects application-service targets", async () => {
    const safety = new SafetySession(10_000);
    await expect(injectFs3SensorStop(target("payment-api"), safety)).rejects.toThrow(
      /only metrics-proxy/
    );
    await safety.cleanup();
  });
});
