import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("parses a valid environment", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
      REDIS_URL: "redis://localhost:6379"
    });

    expect(config.NODE_ENV).toBe("test");
    expect(config.PROMETHEUS_URL).toBe("http://localhost:9090");
    expect(config.METRICS_PROXY_CHAOS_TOKEN).toBe("local-chaos-control-token");
    expect(config.OUTBOX_RELAY_PORT).toBe(3004);
    expect(config.OUTBOX_RELAY_POLL_MS).toBe(250);
    expect(config.OUTBOX_RELAY_BATCH_SIZE).toBe(50);
  });

  it("rejects a weak metrics-proxy chaos token", () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
        REDIS_URL: "redis://localhost:6379",
        METRICS_PROXY_CHAOS_TOKEN: "short"
      })
    ).toThrow(/METRICS_PROXY_CHAOS_TOKEN/);
  });

  it("throws a readable error when required vars are missing", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });
});
