import { describe, expect, it, vi } from "vitest";
import { ToxiproxyClient, toxicDefinition } from "./fs4.js";

describe("FS-4 Toxiproxy injector", () => {
  it("builds latency with jitter", () => {
    expect(
      toxicDefinition(
        {
          proxy: "api-postgres",
          toxic: "latency",
          stream: "downstream",
          inject_after_s: 1,
          latency_ms: 750,
          jitter_ms: 125
        },
        "run-toxic"
      )
    ).toEqual({
      name: "run-toxic",
      type: "latency",
      stream: "downstream",
      toxicity: 1,
      attributes: { latency: 750, jitter: 125 }
    });
  });

  it("builds an upstream reset-peer toxic", () => {
    expect(
      toxicDefinition(
        {
          proxy: "api-redis",
          toxic: "reset_peer",
          stream: "upstream",
          inject_after_s: 1,
          jitter_ms: 0,
          timeout_ms: 25
        },
        "reset-toxic"
      )
    ).toEqual({
      name: "reset-toxic",
      type: "reset_peer",
      stream: "upstream",
      toxicity: 1,
      attributes: { timeout: 25 }
    });
  });

  it("treats removal of an already absent toxic as idempotent", async () => {
    const request = vi.fn(async () => new Response(null, { status: 404 }));
    const client = new ToxiproxyClient("http://127.0.0.1:8474", request);
    await expect(client.removeToxic("worker-sink", "missing")).resolves.toBeUndefined();
  });
});
