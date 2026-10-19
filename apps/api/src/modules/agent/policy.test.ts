import { describe, expect, it } from "vitest";
import { evaluateAgentPolicy, isAgentModeEnabled } from "./policy.js";

describe("Agent Mode access policy", () => {
  it("enables Agent Mode without an entitlement in production", () => {
    expect(isAgentModeEnabled()).toBe(true);
  });

  it("allows low-risk tools without billing entitlement checks", () => {
    expect(evaluateAgentPolicy("low")).toEqual({ allowed: true });
  });

  it.each(["medium", "high"] as const)("requires approval for %s-risk actions", (risk) => {
    expect(evaluateAgentPolicy(risk)).toEqual({
      allowed: false,
      reason: "approval_required",
    });
  });
});
