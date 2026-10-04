import { z } from "zod";

export const controllerPolicySchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  enabled: z.boolean(),
  targetService: z.string().min(1),
  condition: z.literal("container_not_running"),
  action: z.literal("restart"),
  breachCount: z.number().int().positive(),
  cooldownMs: z.number().int().nonnegative(),
  maxRestarts: z.number().int().positive(),
  restartWindowMs: z.number().int().positive(),
  pollIntervalMs: z.number().int().min(100)
});

export type ControllerPolicy = z.infer<typeof controllerPolicySchema>;

export interface TargetSnapshot {
  service: string;
  running: boolean;
  paused: boolean;
  observedAtMs: number;
}

export interface PolicyState {
  consecutiveBreaches: number;
  incidentOpen: boolean;
  lastActionAtMs: number | null;
  actionTimestampsMs: number[];
}

export interface PolicyEvaluation {
  state: PolicyState;
  detected: boolean;
  plan: "restart" | null;
  blockedBy: "cooldown" | "restart_limit" | null;
}

export function initialPolicyState(): PolicyState {
  return {
    consecutiveBreaches: 0,
    incidentOpen: false,
    lastActionAtMs: null,
    actionTimestampsMs: []
  };
}

export function evaluatePolicy(
  policy: ControllerPolicy,
  snapshot: TargetSnapshot,
  previous: PolicyState
): PolicyEvaluation {
  const actionTimestampsMs = previous.actionTimestampsMs.filter(
    (timestamp) => snapshot.observedAtMs - timestamp < policy.restartWindowMs
  );
  if (snapshot.running && !snapshot.paused) {
    return {
      state: { ...previous, consecutiveBreaches: 0, incidentOpen: false, actionTimestampsMs },
      detected: false,
      plan: null,
      blockedBy: null
    };
  }

  const consecutiveBreaches = previous.consecutiveBreaches + 1;
  if (consecutiveBreaches < policy.breachCount) {
    return {
      state: { ...previous, consecutiveBreaches, actionTimestampsMs },
      detected: false,
      plan: null,
      blockedBy: null
    };
  }

  const detected = !previous.incidentOpen;
  const state = { ...previous, consecutiveBreaches, incidentOpen: true, actionTimestampsMs };
  if (
    previous.lastActionAtMs !== null &&
    snapshot.observedAtMs - previous.lastActionAtMs < policy.cooldownMs
  ) {
    return { state, detected, plan: null, blockedBy: "cooldown" };
  }
  if (actionTimestampsMs.length >= policy.maxRestarts) {
    return { state, detected, plan: null, blockedBy: "restart_limit" };
  }
  return { state, detected, plan: "restart", blockedBy: null };
}

export function recordAction(state: PolicyState, atMs: number): PolicyState {
  return {
    ...state,
    lastActionAtMs: atMs,
    actionTimestampsMs: [...state.actionTimestampsMs, atMs]
  };
}
