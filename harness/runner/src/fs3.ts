import { injectFs1, type Fs1Container } from "./fs1.js";
import type { SafetySession, TargetIdentity } from "./safety.js";

export async function injectFs3SensorStop(
  target: TargetIdentity,
  safety: SafetySession,
  container?: Fs1Container
): Promise<void> {
  if (target.service !== "metrics-proxy") {
    throw new Error(`FS-3 may stop only metrics-proxy, not ${target.service ?? target.id}`);
  }
  await injectFs1(target, "stop", safety, container);
}
