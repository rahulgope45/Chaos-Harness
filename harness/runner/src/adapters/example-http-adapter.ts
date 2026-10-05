import { randomUUID } from "node:crypto";
import type { FaultAdapter, RevertRegistry } from "./fault-adapter.js";

export interface ExampleHttpFaultConfig {
  target: string;
  mode: string;
}

export interface ExampleHttpTarget {
  name: string;
}

function requireLoopbackBaseUrl(value: string): string {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  ) {
    throw new Error(`Example adapter refuses non-loopback endpoint: ${value}`);
  }
  return url.toString().replace(/\/$/, "");
}

export class ExampleHttpFaultAdapter implements FaultAdapter<
  ExampleHttpFaultConfig,
  ExampleHttpTarget
> {
  readonly kind = "example-http";
  private readonly baseUrl: string;
  private readonly targets: ReadonlySet<string>;
  private readonly modes: ReadonlySet<string>;

  constructor(
    baseUrl: string,
    allowedTargets: readonly string[],
    allowedModes: readonly string[],
    private readonly request: typeof fetch = fetch
  ) {
    this.baseUrl = requireLoopbackBaseUrl(baseUrl);
    this.targets = new Set(allowedTargets);
    this.modes = new Set(allowedModes);
  }

  private assertAllowed(config: ExampleHttpFaultConfig): void {
    if (!this.targets.has(config.target))
      throw new Error(`Target ${config.target} is not allowlisted`);
    if (!this.modes.has(config.mode)) throw new Error(`Mode ${config.mode} is not allowlisted`);
  }

  async preflight(config: ExampleHttpFaultConfig): Promise<ExampleHttpTarget> {
    this.assertAllowed(config);
    const response = await this.request(
      `${this.baseUrl}/targets/${encodeURIComponent(config.target)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!response.ok) throw new Error(`Target preflight returned ${response.status}`);
    const body: unknown = await response.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("name" in body) ||
      body.name !== config.target ||
      !("faultable" in body) ||
      body.faultable !== true
    ) {
      throw new Error("Target preflight returned an unverified identity");
    }
    return { name: config.target };
  }

  async inject(
    target: ExampleHttpTarget,
    config: ExampleHttpFaultConfig,
    safety: RevertRegistry
  ): Promise<void> {
    this.assertAllowed(config);
    if (target.name !== config.target)
      throw new Error("Resolved target does not match config target");
    const faultId = randomUUID();
    const faultUrl = `${this.baseUrl}/faults/${faultId}`;
    safety.registerRevert(async () => {
      const response = await this.request(faultUrl, {
        method: "DELETE",
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(`Example adapter revert returned ${response.status}`);
      }
    });
    const response = await this.request(faultUrl, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: target.name, mode: config.mode }),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error(`Example adapter injection returned ${response.status}`);
  }
}
