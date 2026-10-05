import Docker from "dockerode";
import type { SteadyStateSnapshot } from "./prometheus.js";

export function assertLocalDockerHost(dockerHost = process.env.DOCKER_HOST): void {
  if (!dockerHost) return;
  if (dockerHost.startsWith("npipe://") || dockerHost.startsWith("unix://")) return;
  let parsed: URL;
  try {
    parsed = new URL(dockerHost);
  } catch {
    throw new Error(`Refusing unrecognized DOCKER_HOST: ${dockerHost}`);
  }
  if (
    !["tcp:", "http:", "https:"].includes(parsed.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)
  ) {
    throw new Error(`Refusing non-local Docker host: ${dockerHost}`);
  }
}

export interface TargetIdentity {
  id: string;
  service: string | undefined;
  labels: Record<string, string>;
}

export function assertTargetAllowed(target: TargetIdentity, requestedService: string): void {
  if (target.service !== requestedService) {
    throw new Error(`Resolved container is not Compose service ${requestedService}`);
  }
  if (target.labels["chaos-target"] !== "true") {
    throw new Error(`Refusing unlabeled target ${requestedService}`);
  }
}

export async function resolveAllowedTarget(
  requestedService: string,
  dockerHost = process.env.DOCKER_HOST
): Promise<TargetIdentity> {
  assertLocalDockerHost(dockerHost);
  const docker = new Docker();
  const containers = await docker.listContainers({ all: true });
  const match = containers.find(
    ({ Labels }) =>
      Labels["com.docker.compose.project"] === "chaos-harness" &&
      Labels["com.docker.compose.service"] === requestedService
  );
  if (!match) throw new Error(`Compose target ${requestedService} was not found`);
  const target = {
    id: match.Id,
    service: match.Labels["com.docker.compose.service"],
    labels: match.Labels
  };
  assertTargetAllowed(target, requestedService);
  return target;
}

export function createTargetHealthReader(
  target: TargetIdentity,
  dockerHost = process.env.DOCKER_HOST
): () => Promise<boolean> {
  assertLocalDockerHost(dockerHost);
  if (!target.service) throw new Error(`Target ${target.id} has no Compose service label`);
  assertTargetAllowed(target, target.service);
  const container = new Docker().getContainer(target.id);
  return async () => {
    const state = (await container.inspect()).State;
    return state.Running && !state.Paused;
  };
}

export class SafetySession {
  readonly signal: AbortSignal;
  private readonly controller = new AbortController();
  private readonly reverts: Array<() => Promise<void>> = [];
  private readonly timer: NodeJS.Timeout;
  private cleaned = false;
  private readonly signalHandler = () => this.abort(new Error("Experiment interrupted by signal"));

  constructor(maxDurationMs: number) {
    this.signal = this.controller.signal;
    this.timer = setTimeout(
      () => this.abort(new Error(`Experiment exceeded hard limit of ${maxDurationMs}ms`)),
      maxDurationMs
    );
    process.once("SIGINT", this.signalHandler);
    process.once("SIGTERM", this.signalHandler);
  }

  abort(reason: Error): void {
    if (!this.controller.signal.aborted) this.controller.abort(reason);
  }

  registerRevert(revert: () => Promise<void>): void {
    this.reverts.push(revert);
  }

  async revertAll(): Promise<void> {
    const errors: unknown[] = [];
    for (const revert of [...this.reverts].reverse()) {
      try {
        await revert();
      } catch (error) {
        errors.push(error);
      }
    }
    this.reverts.length = 0;
    if (errors.length > 0) throw new AggregateError(errors, "One or more fault reverts failed");
  }

  async cleanup(): Promise<void> {
    if (this.cleaned) return;
    this.cleaned = true;
    clearTimeout(this.timer);
    process.removeListener("SIGINT", this.signalHandler);
    process.removeListener("SIGTERM", this.signalHandler);
    await this.revertAll();
  }
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

export async function watchErrorRate(
  read: () => Promise<SteadyStateSnapshot>,
  threshold: number,
  session: SafetySession,
  stopSignal: AbortSignal,
  pollMs = 1000
): Promise<never> {
  while (!stopSignal.aborted && !session.signal.aborted) {
    const snapshot = await read();
    if (snapshot.error_rate > threshold) {
      const error = new Error(
        `Safety abort: error rate ${snapshot.error_rate} exceeded ${threshold}`
      );
      session.abort(error);
      throw error;
    }
    await abortableDelay(pollMs, stopSignal);
  }
  throw session.signal.reason ?? new Error("Error-rate watcher stopped");
}
