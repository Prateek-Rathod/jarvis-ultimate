import { env } from "../../config/env.js";

export const AGENT_CAPABILITIES = ["agent_mode"] as const;
export type AgentCapability = (typeof AGENT_CAPABILITIES)[number];

export interface EntitlementSnapshot {
  status: string;
  capabilities: string[];
  expiresAt: Date | null;
}

export type AgentPolicyDecision =
  { allowed: true } | { allowed: false; reason: "entitlement_required" | "approval_required" };

export function hasAgentCapability(
  entitlement: EntitlementSnapshot | null,
  capability: AgentCapability,
  now = new Date(),
): boolean {
  return Boolean(
    entitlement &&
    entitlement.status === "active" &&
    entitlement.capabilities.includes(capability) &&
    (!entitlement.expiresAt || entitlement.expiresAt.getTime() > now.getTime()),
  );
}

export function isAgentModeEnabled(
  entitlement: EntitlementSnapshot | null,
  developmentMode = env.NODE_ENV === "development",
  now = new Date(),
): boolean {
  return developmentMode || hasAgentCapability(entitlement, "agent_mode", now);
}

export function evaluateAgentPolicy(
  entitlement: EntitlementSnapshot | null,
  capability: AgentCapability,
  risk: "low" | "medium" | "high",
  developmentMode = env.NODE_ENV === "development",
  now = new Date(),
): AgentPolicyDecision {
  if (!developmentMode && !hasAgentCapability(entitlement, capability, now)) {
    return { allowed: false, reason: "entitlement_required" };
  }
  if (risk !== "low") return { allowed: false, reason: "approval_required" };
  return { allowed: true };
}
