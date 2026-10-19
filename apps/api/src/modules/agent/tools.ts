import type { Prisma } from "@prisma/client";
import type { AgentPlan } from "./planning.js";

export const agentTools = [
  {
    name: "create_task",
    description: "Add a task to the authenticated user's JARVIS task list.",
    risk: "low",
    timeoutMs: 5_000,
    requiresConfirmation: false,
    retryPolicy: "never",
    cancellation: "transactional",
    verification: "Confirm the persisted task belongs to the user and matches the requested title.",
  },
  {
    name: "open_website",
    description: "Open a validated public website after explicit user confirmation.",
    risk: "low",
    timeoutMs: 5_000,
    requiresConfirmation: true,
    retryPolicy: "never",
    cancellation: "not_applicable",
    verification: "The browser reports that it initiated a new tab to the validated destination.",
  },
] as const satisfies ReadonlyArray<{
  name: AgentPlan["tool"];
  description: string;
  risk: "low" | "medium" | "high";
  timeoutMs: number;
  requiresConfirmation: boolean;
  retryPolicy: "never";
  cancellation: "transactional" | "not_applicable";
  verification: string;
}>;

export class AgentTaskCancelledDuringExecution extends Error {
  constructor() {
    super("The agent task was cancelled before its action could be committed.");
    this.name = "AgentTaskCancelledDuringExecution";
  }
}

export async function executeAgentPlan(
  transaction: Prisma.TransactionClient,
  userId: string,
  plan: AgentPlan,
): Promise<{ taskId: string; title: string }> {
  switch (plan.tool) {
    case "create_task": {
      const createdTask = await transaction.task.create({
        data: { userId, title: plan.arguments.title },
        select: { id: true, userId: true, title: true },
      });
      if (createdTask.userId !== userId || createdTask.title !== plan.arguments.title) {
        throw new Error("The created task did not match the requested action.");
      }
      return { taskId: createdTask.id, title: createdTask.title };
    }
    case "open_website":
      throw new Error("Website navigation must be confirmed and executed by the user's browser.");
  }
}
