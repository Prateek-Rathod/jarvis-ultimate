import { describe, expect, it } from "vitest";
import {
  evaluateAgentPolicy,
  hasAgentCapability,
  isAgentModeEnabled,
  type EntitlementSnapshot,
} from "./policy.js";

const activeEntitlement = {
  status: "active",
  capabilities: ["agent_mode"],
  expiresAt: null,
};

describe("Agent Mode access policy", () => {
  it("allows development accounts to test without entitlements", () => {
    expect(isAgentModeEnabled(null, true)).toBe(true);
    expect(evaluateAgentPolicy(null, "agent_mode", "low", true)).toEqual({ allowed: true });
  });

  it("continues to require server-side entitlement outside development", () => {
    expect(isAgentModeEnabled(null, false)).toBe(false);
    expect(evaluateAgentPolicy(null, "agent_mode", "low", false)).toEqual({
      allowed: false,
      reason: "entitlement_required",
    });
  });

  it("allows a valid low-risk tool for an active entitlement", () => {
    expect(isAgentModeEnabled(activeEntitlement, false)).toBe(true);
    expect(evaluateAgentPolicy(activeEntitlement, "agent_mode", "low", false)).toEqual({
      allowed: true,
    });
  });

  it.each([
    { name: "revoked", entitlement: { ...activeEntitlement, status: "revoked" } },
    {
      name: "expired",
      entitlement: { ...activeEntitlement, expiresAt: new Date("2026-10-18T00:00:00.000Z") },
    },
    { name: "missing capability", entitlement: { ...activeEntitlement, capabilities: [] } },
  ] satisfies { name: string; entitlement: EntitlementSnapshot }[])(
    "denies a $name entitlement outside development",
    ({ entitlement }) => {
      expect(
        hasAgentCapability(entitlement, "agent_mode", new Date("2026-10-19T00:00:00.000Z")),
      ).toBe(false);
      expect(isAgentModeEnabled(entitlement, false, new Date("2026-10-19T00:00:00.000Z"))).toBe(
        false,
      );
    },
  );

  it.each(["medium", "high"] as const)("requires approval for %s-risk actions", (risk) => {
    expect(evaluateAgentPolicy(activeEntitlement, "agent_mode", risk, false)).toEqual({
      allowed: false,
      reason: "approval_required",
    });
  });
});
