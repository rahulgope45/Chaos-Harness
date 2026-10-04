import Docker from "dockerode";
import type { SafetySession, TargetIdentity } from "./safety.js";

export type Fs1Action = "kill" | "stop" | "pause" | "restart";

export interface Fs1Container {
  inspect(): Promise<{ State: { Running: boolean; Paused: boolean } }>;
  kill(options?: { signal?: string }): Promise<unknown>;
  stop(options?: { t?: number }): Promise<unknown>;
  pause(): Promise<unknown>;
  unpause(): Promise<unknown>;
  restart(options?: { t?: number }): Promise<unknown>;
  start(): Promise<unknown>;
}

async function ensureRunning(container: Fs1Container): Promise<void> {
  const state = (await container.inspect()).State;
  if (state.Paused) await container.unpause();
  if (!state.Running) await container.start();
}

export async function injectFs1(
  target: TargetIdentity,
  action: Fs1Action,
  safety: SafetySession,
  container: Fs1Container = new Docker().getContainer(target.id)
): Promise<void> {
  const initial = (await container.inspect()).State;
  if (!initial.Running)
    throw new Error(`FS-1 target ${target.service ?? target.id} is not running`);

  switch (action) {
    case "kill":
      safety.registerRevert(() => ensureRunning(container));
      await container.kill({ signal: "SIGKILL" });
      return;
    case "stop":
      safety.registerRevert(() => ensureRunning(container));
      await container.stop({ t: 5 });
      return;
    case "pause":
      if (initial.Paused)
        throw new Error(`FS-1 target ${target.service ?? target.id} is already paused`);
      safety.registerRevert(async () => {
        if ((await container.inspect()).State.Paused) await container.unpause();
      });
      await container.pause();
      return;
    case "restart":
      safety.registerRevert(() => ensureRunning(container));
      await container.restart({ t: 5 });
  }
}

export function waitForInjection(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true }
    );
  });
}
