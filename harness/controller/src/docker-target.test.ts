import { describe, expect, it } from "vitest";
import { assertControllerTarget, assertLocalDockerHost } from "./docker-target.js";

describe("controller Docker safety boundary", () => {
  it("rejects remote Docker hosts", () => {
    expect(() => assertLocalDockerHost("tcp://10.20.30.40:2375")).toThrow(/non-local/);
  });

  it("rejects targets without the attack label", () => {
    expect(() =>
      assertControllerTarget(
        {
          id: "container-1",
          service: "payment-worker",
          labels: { "com.docker.compose.project": "chaos-harness" }
        },
        "payment-worker"
      )
    ).toThrow(/unlabeled/);
  });
});
