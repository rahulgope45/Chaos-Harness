import type { Experiment } from "./config.js";

type Fs4Options = NonNullable<Experiment["fs4"]>;

export interface ToxicDefinition {
  name: string;
  type: Fs4Options["toxic"];
  stream: Fs4Options["stream"];
  toxicity: number;
  attributes: Record<string, number>;
}

export function toxicDefinition(options: Fs4Options, name: string): ToxicDefinition {
  const attributes =
    options.toxic === "latency"
      ? { latency: options.latency_ms ?? 0, jitter: options.jitter_ms }
      : { timeout: options.timeout_ms ?? 0 };
  return { name, type: options.toxic, stream: options.stream, toxicity: 1, attributes };
}

export class ToxiproxyClient {
  constructor(
    private readonly baseUrl: string,
    private readonly request: typeof fetch = fetch
  ) {}

  async assertProxy(proxy: string): Promise<void> {
    const response = await this.request(`${this.baseUrl}/proxies/${encodeURIComponent(proxy)}`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error(`Toxiproxy proxy ${proxy} returned ${response.status}`);
  }

  async addToxic(proxy: string, toxic: ToxicDefinition): Promise<void> {
    const response = await this.request(
      `${this.baseUrl}/proxies/${encodeURIComponent(proxy)}/toxics`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toxic),
        signal: AbortSignal.timeout(5000)
      }
    );
    if (!response.ok) throw new Error(`Adding Toxiproxy toxic returned ${response.status}`);
  }

  async removeToxic(proxy: string, name: string): Promise<void> {
    const response = await this.request(
      `${this.baseUrl}/proxies/${encodeURIComponent(proxy)}/toxics/${encodeURIComponent(name)}`,
      { method: "DELETE", signal: AbortSignal.timeout(5000) }
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`Removing Toxiproxy toxic returned ${response.status}`);
    }
  }
}
