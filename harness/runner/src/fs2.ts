import { z } from "zod";
import type { Experiment } from "./config.js";

export type Fs2Mode = NonNullable<Experiment["fs2"]>["mode"];

const stateSchema = z.object({
  mode: z.enum(["none", "spike", "drop", "freeze", "noise", "counter_reset"])
});

export class MetricsProxyControlClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly request: typeof fetch = fetch
  ) {}

  private headers(json = false): Record<string, string> {
    return {
      authorization: `Bearer ${this.token}`,
      ...(json ? { "content-type": "application/json" } : {})
    };
  }

  async readMode(): Promise<Fs2Mode | "none"> {
    const response = await this.request(new URL("/chaos/state", this.baseUrl), {
      headers: this.headers(),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error(`Metrics proxy state returned ${response.status}`);
    return stateSchema.parse(await response.json()).mode;
  }

  async setMode(mode: Fs2Mode | "none"): Promise<void> {
    const response = await this.request(new URL("/chaos/mode", this.baseUrl), {
      method: "PUT",
      headers: this.headers(true),
      body: JSON.stringify({ mode }),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error(`Metrics proxy mode change returned ${response.status}`);
    const state = stateSchema.parse(await response.json());
    if (state.mode !== mode) throw new Error(`Metrics proxy did not enter ${mode} mode`);
  }
}
