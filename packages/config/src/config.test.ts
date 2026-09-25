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
  });

  it("throws a readable error when required vars are missing", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });
});
