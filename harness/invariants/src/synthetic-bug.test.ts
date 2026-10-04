import { describe, expect, it } from "vitest";
import { runSyntheticScenarioS001 } from "./synthetic-bug.js";

describe("explicitly synthetic bug S-001", () => {
  it("detects duplicate side effects in the planted non-idempotent consumer", () => {
    const result = runSyntheticScenarioS001();

    expect(result.classification).toBe("synthetic");
    expect(result.genuine_finding).toBe(false);
    expect(result.status).toBe("detected");
    expect(result.observed.side_effect_count).toBe(2);
    expect(result.violations).toEqual([{ event_id: "synthetic-event-001", side_effect_count: 2 }]);
  });
});
