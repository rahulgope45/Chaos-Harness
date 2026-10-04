export type Phase =
  | "preflight"
  | "baseline"
  | "inject"
  | "observe"
  | "revert"
  | "recovery_wait"
  | "verify"
  | "report";

export interface LifecycleHooks {
  preflight(): Promise<void>;
  baseline(): Promise<void>;
  inject(): Promise<void>;
  observe(): Promise<void>;
  revert(): Promise<void>;
  recoveryWait(): Promise<void>;
  verify(): Promise<void>;
  report(): Promise<void>;
  onPhase?(phase: Phase): Promise<void>;
}

export async function executeLifecycle(hooks: LifecycleHooks): Promise<void> {
  const run = async (phase: Phase, action: () => Promise<void>) => {
    await hooks.onPhase?.(phase);
    await action();
  };
  await run("preflight", hooks.preflight);
  await run("baseline", hooks.baseline);
  try {
    await run("inject", hooks.inject);
    await run("observe", hooks.observe);
  } finally {
    await run("revert", hooks.revert);
  }
  await run("recovery_wait", hooks.recoveryWait);
  await run("verify", hooks.verify);
  await run("report", hooks.report);
}
