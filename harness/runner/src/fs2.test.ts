import { describe, expect, it, vi } from "vitest";
import { MetricsProxyControlClient } from "./fs2.js";

describe("FS-2 metrics proxy control", () => {
  it("authorizes, reads, and changes an allowlisted corruption mode", async () => {
    let mode = "none";
    const request = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "PUT") mode = JSON.parse(String(init.body)).mode as string;
      return new Response(JSON.stringify({ mode }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }) as typeof fetch;
    const client = new MetricsProxyControlClient(
      "http://metrics-proxy:3003",
      "test-control-token",
      request
    );

    expect(await client.readMode()).toBe("none");
    await client.setMode("freeze");
    expect(await client.readMode()).toBe("freeze");
    expect(request).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer test-control-token" })
      })
    );
  });

  it("rejects an unexpected state response", async () => {
    const request = vi.fn(
      async () =>
        new Response(JSON.stringify({ mode: "invented" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
    ) as typeof fetch;
    const client = new MetricsProxyControlClient("http://metrics-proxy:3003", "token", request);
    await expect(client.readMode()).rejects.toThrow();
  });
});
