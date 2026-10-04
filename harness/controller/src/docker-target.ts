import Docker from "dockerode";
import type { TargetSnapshot } from "./policy.js";

interface TargetIdentity {
  id: string;
  service: string | undefined;
  labels: Record<string, string>;
}

export function assertLocalDockerHost(dockerHost = process.env.DOCKER_HOST): void {
  if (!dockerHost || dockerHost.startsWith("npipe://") || dockerHost.startsWith("unix://")) return;
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

export function assertControllerTarget(target: TargetIdentity, requestedService: string): void {
  if (target.service !== requestedService) {
    throw new Error(`Resolved container is not Compose service ${requestedService}`);
  }
  if (target.labels["com.docker.compose.project"] !== "chaos-harness") {
    throw new Error(`Refusing target outside chaos-harness: ${requestedService}`);
  }
  if (target.labels["chaos-target"] !== "true") {
    throw new Error(`Refusing unlabeled target ${requestedService}`);
  }
}

export interface TargetManager {
  observe(service: string): Promise<TargetSnapshot>;
  restartAndVerify(service: string, timeoutMs: number): Promise<void>;
}

export class DockerTargetManager implements TargetManager {
  private readonly docker: Docker;

  constructor(dockerHost = process.env.DOCKER_HOST) {
    assertLocalDockerHost(dockerHost);
    this.docker = new Docker();
  }

  private async resolve(service: string): Promise<TargetIdentity> {
    const containers = await this.docker.listContainers({ all: true });
    const match = containers.find(
      ({ Labels }) =>
        Labels["com.docker.compose.project"] === "chaos-harness" &&
        Labels["com.docker.compose.service"] === service
    );
    if (!match) throw new Error(`Compose target ${service} was not found`);
    const target = {
      id: match.Id,
      service: match.Labels["com.docker.compose.service"],
      labels: match.Labels
    };
    assertControllerTarget(target, service);
    return target;
  }

  async observe(service: string): Promise<TargetSnapshot> {
    const target = await this.resolve(service);
    const state = (await this.docker.getContainer(target.id).inspect()).State;
    return {
      service,
      running: state.Running,
      paused: state.Paused,
      observedAtMs: Date.now()
    };
  }

  async restartAndVerify(service: string, timeoutMs: number): Promise<void> {
    const target = await this.resolve(service);
    const container = this.docker.getContainer(target.id);
    await container.restart({ t: 5 });
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const state = (await container.inspect()).State;
      if (state.Running && !state.Paused) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Controller restart verification timed out for ${service}`);
  }
}
