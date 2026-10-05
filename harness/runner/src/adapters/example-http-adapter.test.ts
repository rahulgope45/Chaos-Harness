import { describe, expect, it, vi } from "vitest";
import { ExampleHttpFaultAdapter } from "./example-http-adapter.js";

describe("example HTTP fault adapter", () => {
  it("refuses remote endpoints and non-allowlisted inputs", async () => {
    expect(() => new ExampleHttpFaultAdapter("https://example.com", ["cache"], ["pause"])).toThrow(
      "non-loopback"
    );
    const adapter = new ExampleHttpFaultAdapter(
      "http://127.0.0.1:3999",
      ["cache"],
      ["pause"],
      vi.fn()
    );
    await expect(adapter.preflight({ target: "database", mode: "pause" })).rejects.toThrow(
      "not allowlisted"
    );
    await expect(adapter.preflight({ target: "cache", mode: "delete" })).rejects.toThrow(
      "not allowlisted"
    );
  });

  it("refuses a preflight response that does not verify the requested identity", async () => {
    const adapter = new ExampleHttpFaultAdapter(
      "http://127.0.0.1:3999",
      ["cache"],
      ["pause"],
      vi.fn(async () => Response.json({ name: "other", faultable: true })) as typeof fetch
    );
    await expect(adapter.preflight({ target: "cache", mode: "pause" })).rejects.toThrow(
      "unverified identity"
    );
  });

  it("preflights and registers cleanup before mutation", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const request = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url: String(input), method });
      return method === "GET"
        ? Response.json({ name: "cache", faultable: true })
        : new Response(null, { status: 200 });
    }) as typeof fetch;
    const reverts: Array<() => Promise<void>> = [];
    const adapter = new ExampleHttpFaultAdapter(
      "http://127.0.0.1:3999",
      ["cache"],
      ["pause"],
      request
    );
    const config = { target: "cache", mode: "pause" };

    const target = await adapter.preflight(config);
    await adapter.inject(target, config, { registerRevert: (revert) => reverts.push(revert) });

    expect(reverts).toHaveLength(1);
    expect(calls.map(({ method }) => method)).toEqual(["GET", "PUT"]);
    await reverts[0]?.();
    expect(calls.map(({ method }) => method)).toEqual(["GET", "PUT", "DELETE"]);
  });
});
