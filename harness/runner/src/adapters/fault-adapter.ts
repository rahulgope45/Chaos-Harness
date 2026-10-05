import type { SafetySession } from "../safety.js";

export type RevertRegistry = Pick<SafetySession, "registerRevert">;

export interface FaultAdapter<TConfig, TTarget> {
  readonly kind: string;
  preflight(config: TConfig): Promise<TTarget>;
  inject(target: TTarget, config: TConfig, safety: RevertRegistry): Promise<void>;
}
