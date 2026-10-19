export type AgentPolicyDecision =
  { allowed: true } | { allowed: false; reason: "approval_required" };

export function isAgentModeEnabled(): boolean {
  return true;
}

export function evaluateAgentPolicy(risk: "low" | "medium" | "high"): AgentPolicyDecision {
  if (risk !== "low") return { allowed: false, reason: "approval_required" };
  return { allowed: true };
}
