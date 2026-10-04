import { describe, expect, it, vi } from "vitest";
import { injectFs1, type Fs1Container } from "./fs1.js";
import { SafetySession, type TargetIdentity } from "./safety.js";

const target: TargetIdentity = {
  id: "container-id",
  service: "payment-worker",
  labels: { "chaos-target": "true" }
};

function fakeContainer() {
  const state = { Running: true, Paused: false };
  const container: Fs1Container = {
    inspect: vi.fn(async () => ({ State: { ...state } })),
    kill: vi.fn(async () => void (state.Running = false)),
    stop: vi.fn(async () => void (state.Running = false)),
    pause: vi.fn(async () => void (state.Paused = true)),
    unpause: vi.fn(async () => void (state.Paused = false)),
    restart: vi.fn(async () => undefined),
    start: vi.fn(async () => void (state.Running = true))
  };
  return { container, state };
}

describe("FS-1 injector", () => {
  for (const action of ["kill", "stop"] as const) {
    it(`${action} registers recovery before taking the container down`, async () => {
      const fixture = fakeContainer();
      const safety = new SafetySession(10_000);
      await injectFs1(target, action, safety, fixture.container);
      expect(fixture.state.Running).toBe(false);
      await safety.cleanup();
      expect(fixture.state.Running).toBe(true);
      expect(fixture.container.start).toHaveBeenCalledOnce();
    });
  }

  it("reverts pause with unpause", async () => {
    const fixture = fakeContainer();
    const safety = new SafetySession(10_000);
    await injectFs1(target, "pause", safety, fixture.container);
    expect(fixture.state.Paused).toBe(true);
    await safety.cleanup();
    expect(fixture.state.Paused).toBe(false);
  });

  it("refuses a stopped target before registering a mutation", async () => {
    const fixture = fakeContainer();
    fixture.state.Running = false;
    const safety = new SafetySession(10_000);
    await expect(injectFs1(target, "kill", safety, fixture.container)).rejects.toThrow(
      "not running"
    );
    expect(fixture.container.kill).not.toHaveBeenCalled();
    await safety.cleanup();
  });

  it("uses Docker restart and leaves the target running", async () => {
    const fixture = fakeContainer();
    const safety = new SafetySession(10_000);
    await injectFs1(target, "restart", safety, fixture.container);
    expect(fixture.container.restart).toHaveBeenCalledOnce();
    await safety.cleanup();
    expect(fixture.state.Running).toBe(true);
  });
});
