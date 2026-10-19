import { Router, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../../database/client.js";
import { authenticate, requireCsrf } from "../../middleware/authentication.js";
import { evaluateAgentPolicy, isAgentModeEnabled } from "./policy.js";
import { interpretAgentInstruction } from "./intent.js";
import { isSafeNavigationUrl, planAgentInstruction } from "./planning.js";
import { AgentTaskCancelledDuringExecution, agentTools, executeAgentPlan } from "./tools.js";

export const agentRouter = Router();
agentRouter.use(authenticate);

const taskInclude = { steps: { orderBy: { position: "asc" as const } } };
const taskCommandSchema = z.object({ instruction: z.string().trim().min(1).max(4_000) }).strict();
const navigationResultSchema = z
  .object({
    type: z.literal("navigation_confirmation"),
    url: z.string().url().max(2_048),
    label: z.string().trim().min(1).max(120),
  })
  .strict()
  .superRefine(({ url }, context) => {
    if (!isSafeNavigationUrl(url)) {
      context.addIssue({ code: "custom", message: "Unsafe navigation URL." });
    }
  });
const createAgentTaskLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

function agentError(response: Response, status: number, code: string, message: string) {
  response.status(status).json({ success: false, error: { code, message } });
}

function isUniqueConflict(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === "P2002";
}

async function findOwnedTask(userId: string, id: string) {
  return prisma.agentTask.findFirst({
    where: { id, userId },
    include: taskInclude,
  });
}

agentRouter.get("/capabilities", async (request, response, next) => {
  try {
    const entitlement = await prisma.agentEntitlement.findUnique({
      where: { userId: request.auth!.user.id },
      select: { status: true, capabilities: true, expiresAt: true },
    });
    response.json({
      success: true,
      data: {
        enabled: isAgentModeEnabled(entitlement),
        tools: agentTools.map(({ name, description, risk, requiresConfirmation }) => ({
          name,
          description,
          risk,
          requiresConfirmation,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

agentRouter.get("/tasks", async (request, response, next) => {
  try {
    const tasks = await prisma.agentTask.findMany({
      where: { userId: request.auth!.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: taskInclude,
    });
    response.json({ success: true, data: tasks });
  } catch (error) {
    next(error);
  }
});

agentRouter.get("/tasks/:id", async (request, response, next) => {
  try {
    const id = z.string().uuid().parse(request.params.id);
    const task = await findOwnedTask(request.auth!.user.id, id);
    if (!task) {
      agentError(response, 404, "AGENT_TASK_NOT_FOUND", "Agent task not found.");
      return;
    }
    response.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
});

agentRouter.post("/tasks", createAgentTaskLimiter, requireCsrf, async (request, response, next) => {
  const parsedCommand = taskCommandSchema.safeParse(request.body);
  const idempotencyKey = z.string().uuid().safeParse(request.get("idempotency-key"));
  if (!parsedCommand.success) {
    next(parsedCommand.error);
    return;
  }
  if (!idempotencyKey.success) {
    agentError(
      response,
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "Retry-safe task creation requires a valid Idempotency-Key header.",
    );
    return;
  }

  const userId = request.auth!.user.id;
  try {
    const priorTask = await prisma.agentTask.findFirst({
      where: { userId, idempotencyKey: idempotencyKey.data },
      include: taskInclude,
    });
    if (priorTask) {
      if (priorTask.instruction !== parsedCommand.data.instruction) {
        agentError(
          response,
          409,
          "IDEMPOTENCY_KEY_REUSED",
          "This idempotency key was already used for a different instruction.",
        );
        return;
      }
      response.json({ success: true, data: priorTask });
      return;
    }

    const entitlement = await prisma.agentEntitlement.findUnique({
      where: { userId },
      select: { status: true, capabilities: true, expiresAt: true },
    });
    if (!isAgentModeEnabled(entitlement)) {
      agentError(
        response,
        403,
        "AGENT_ENTITLEMENT_REQUIRED",
        "Agent Mode is unavailable for this account.",
      );
      return;
    }

    const agentTask = await prisma.agentTask.create({
      data: {
        userId,
        instruction: parsedCommand.data.instruction,
        idempotencyKey: idempotencyKey.data,
        status: "planning",
        steps: {
          create: {
            position: 0,
            tool: "planner",
            description: "Understand the instruction and check supported actions.",
            risk: "low",
            status: "running",
          },
        },
      },
      select: { id: true },
    });

    let plannedInstruction = planAgentInstruction(parsedCommand.data.instruction);
    if (plannedInstruction.kind === "unsupported") {
      plannedInstruction =
        (await interpretAgentInstruction(parsedCommand.data.instruction)) ?? plannedInstruction;
    }
    if (plannedInstruction.kind !== "execute") {
      const status = plannedInstruction.kind === "needs_input" ? "needs_input" : "unsupported";
      const completedAt = new Date();
      await prisma.$transaction(async (transaction) => {
        await transaction.agentTaskStep.updateMany({
          where: { agentTaskId: agentTask.id, position: 0, status: "running" },
          data: { status: "completed", result: plannedInstruction.message, completedAt },
        });
        await transaction.agentTask.updateMany({
          where: { id: agentTask.id, userId, status: "planning" },
          data: { status, result: plannedInstruction.message, completedAt },
        });
      });
      const task = await findOwnedTask(userId, agentTask.id);
      response.status(201).json({ success: true, data: task });
      return;
    }

    const tool = agentTools.find(({ name }) => name === plannedInstruction.plan.tool);
    if (!tool) {
      agentError(response, 400, "AGENT_TOOL_NOT_FOUND", "The planned tool is not registered.");
      return;
    }
    const policy = evaluateAgentPolicy(entitlement, "agent_mode", tool.risk);
    if (!policy.allowed) {
      agentError(
        response,
        policy.reason === "entitlement_required" ? 403 : 409,
        policy.reason === "entitlement_required"
          ? "AGENT_ENTITLEMENT_REQUIRED"
          : "AGENT_APPROVAL_REQUIRED",
        policy.reason === "entitlement_required"
          ? "Agent Mode is unavailable for this account."
          : "This action requires a separate approval flow that is not yet available.",
      );
      return;
    }

    if (plannedInstruction.plan.tool === "open_website") {
      const navigation = plannedInstruction.plan;
      const result = JSON.stringify({
        type: "navigation_confirmation",
        url: navigation.arguments.url,
        label: navigation.arguments.label,
      });
      const awaitingConfirmation = await prisma.$transaction(async (transaction) => {
        const taskUpdate = await transaction.agentTask.updateMany({
          where: { id: agentTask.id, userId, status: "planning" },
          data: { status: "awaiting_approval", result },
        });
        if (taskUpdate.count !== 1) return false;
        const plannerStepUpdate = await transaction.agentTaskStep.updateMany({
          where: { agentTaskId: agentTask.id, position: 0, status: "running" },
          data: {
            status: "completed",
            result: "Destination validated; waiting for your confirmation in the browser.",
            completedAt: new Date(),
          },
        });
        if (plannerStepUpdate.count !== 1) {
          throw new Error("The navigation planner step could not be completed.");
        }
        await transaction.agentTaskStep.create({
          data: {
            agentTaskId: agentTask.id,
            position: 1,
            tool: "open_website",
            description: `Open ${navigation.arguments.label} in a new browser tab.`,
            risk: tool.risk,
            status: "awaiting_approval",
          },
        });
        return true;
      });
      if (!awaitingConfirmation) {
        agentError(response, 409, "AGENT_TASK_NOT_PENDING", "The agent task is no longer pending.");
        return;
      }
      const task = await findOwnedTask(userId, agentTask.id);
      response.status(201).json({ success: true, data: task });
      return;
    }

    const started = await prisma.$transaction(async (transaction) => {
      const update = await transaction.agentTask.updateMany({
        where: { id: agentTask.id, userId, status: "planning" },
        data: { status: "running" },
      });
      if (update.count === 0) return false;
      await transaction.agentTaskStep.updateMany({
        where: { agentTaskId: agentTask.id, position: 0, status: "running" },
        data: { status: "completed", result: "A supported low-risk action was selected." },
      });
      await transaction.agentTaskStep.create({
        data: {
          agentTaskId: agentTask.id,
          position: 1,
          tool: tool.name,
          description: tool.description,
          risk: tool.risk,
          status: "running",
        },
      });
      return true;
    });

    if (!started) {
      const task = await findOwnedTask(userId, agentTask.id);
      response.json({ success: true, data: task });
      return;
    }

    try {
      await prisma.$transaction(
        async (transaction) => {
          const activeTask = await transaction.agentTask.findFirst({
            where: { id: agentTask.id, userId, status: "running" },
            select: { id: true },
          });
          if (!activeTask) throw new AgentTaskCancelledDuringExecution();

          const result = await executeAgentPlan(transaction, userId, plannedInstruction.plan);
          const completedAt = new Date();
          const stepUpdate = await transaction.agentTaskStep.updateMany({
            where: { agentTaskId: agentTask.id, position: 1, status: "running" },
            data: {
              status: "completed",
              result: `Added "${result.title}" to your JARVIS task list.`,
              completedAt,
            },
          });
          if (stepUpdate.count !== 1) throw new AgentTaskCancelledDuringExecution();

          const taskUpdate = await transaction.agentTask.updateMany({
            where: { id: agentTask.id, userId, status: "running" },
            data: {
              status: "completed",
              result: `Added "${result.title}" to your JARVIS task list.`,
              completedAt,
            },
          });
          if (taskUpdate.count !== 1) throw new AgentTaskCancelledDuringExecution();
        },
        { timeout: tool.timeoutMs },
      );
    } catch (error) {
      if (error instanceof AgentTaskCancelledDuringExecution) {
        const task = await findOwnedTask(userId, agentTask.id);
        response.json({ success: true, data: task });
        return;
      }
      const completedAt = new Date();
      await prisma.$transaction(async (transaction) => {
        await transaction.agentTaskStep.updateMany({
          where: { agentTaskId: agentTask.id, position: 1, status: "running" },
          data: {
            status: "failed",
            result: "The task could not be created. No completion was reported.",
            completedAt,
          },
        });
        await transaction.agentTask.updateMany({
          where: { id: agentTask.id, userId, status: "running" },
          data: {
            status: "failed",
            result: "The task could not be created. Check your task list before retrying.",
            completedAt,
          },
        });
      });
      throw error;
    }

    const task = await findOwnedTask(userId, agentTask.id);
    response.status(201).json({ success: true, data: task });
  } catch (error) {
    if (isUniqueConflict(error)) {
      const duplicate = await prisma.agentTask.findFirst({
        where: { userId, idempotencyKey: idempotencyKey.data },
        include: taskInclude,
      });
      if (duplicate) {
        if (duplicate.instruction !== parsedCommand.data.instruction) {
          agentError(
            response,
            409,
            "IDEMPOTENCY_KEY_REUSED",
            "This idempotency key was already used for a different instruction.",
          );
          return;
        }
        response.json({ success: true, data: duplicate });
        return;
      }
    }
    next(error);
  }
});

agentRouter.post("/tasks/:id/confirm-navigation", requireCsrf, async (request, response, next) => {
  try {
    const id = z.string().uuid().parse(request.params.id);
    const userId = request.auth!.user.id;
    const task = await prisma.agentTask.findFirst({
      where: { id, userId, status: "awaiting_approval" },
      select: { id: true, result: true },
    });
    if (!task) {
      agentError(response, 404, "AGENT_TASK_NOT_FOUND", "Pending navigation was not found.");
      return;
    }

    let storedResult: unknown;
    try {
      storedResult = JSON.parse(task.result ?? "");
    } catch {
      agentError(response, 409, "AGENT_NAVIGATION_INVALID", "The pending destination is invalid.");
      return;
    }
    const navigation = navigationResultSchema.safeParse(storedResult);
    if (!navigation.success) {
      agentError(response, 409, "AGENT_NAVIGATION_INVALID", "The pending destination is invalid.");
      return;
    }

    const completedAt = new Date();
    const confirmation = await prisma.$transaction(async (transaction) => {
      const update = await transaction.agentTask.updateMany({
        where: { id, userId, status: "awaiting_approval" },
        data: {
          status: "completed",
          result: `The browser opened ${navigation.data.label} in a new tab.`,
          completedAt,
        },
      });
      if (update.count !== 1) return false;
      const stepUpdate = await transaction.agentTaskStep.updateMany({
        where: { agentTaskId: id, tool: "open_website", status: "awaiting_approval" },
        data: {
          status: "completed",
          result: `Opened ${navigation.data.url} in a new browser tab.`,
          completedAt,
        },
      });
      if (stepUpdate.count !== 1) {
        throw new Error("The pending website action has no matching execution step.");
      }
      return true;
    });
    if (!confirmation) {
      agentError(
        response,
        409,
        "AGENT_NAVIGATION_ALREADY_HANDLED",
        "This navigation was already handled.",
      );
      return;
    }

    const completedTask = await findOwnedTask(userId, id);
    response.json({ success: true, data: completedTask });
  } catch (error) {
    next(error);
  }
});

agentRouter.delete("/tasks/:id", requireCsrf, async (request, response, next) => {
  try {
    const id = z.string().uuid().parse(request.params.id);
    const userId = request.auth!.user.id;
    const result = await prisma.agentTask.deleteMany({
      where: {
        id,
        userId,
        status: {
          notIn: ["queued", "planning", "running", "awaiting_approval", "verifying"],
        },
      },
    });
    if (result.count === 0) {
      const task = await prisma.agentTask.findFirst({
        where: { id, userId },
        select: { status: true },
      });
      if (!task) {
        agentError(response, 404, "AGENT_TASK_NOT_FOUND", "Agent task not found.");
      } else {
        agentError(
          response,
          409,
          "AGENT_TASK_ACTIVE",
          "Cancel or wait for this task before deleting its history.",
        );
      }
      return;
    }
    response.json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
});

agentRouter.post("/tasks/:id/cancel", requireCsrf, async (request, response, next) => {
  try {
    const id = z.string().uuid().parse(request.params.id);
    const userId = request.auth!.user.id;
    const completedAt = new Date();
    const result = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.agentTask.findFirst({
        where: { id, userId },
        select: { status: true, id: true },
      });
      if (!existing) return { kind: "not_found" as const };
      if (existing.status === "cancelled") {
        return {
          kind: "cancelled" as const,
          task: await transaction.agentTask.findFirst({
            where: { id, userId },
            include: taskInclude,
          }),
        };
      }

      const update = await transaction.agentTask.updateMany({
        where: { id, userId, status: { in: ["planning", "running", "awaiting_approval"] } },
        data: {
          status: "cancelled",
          result: "Cancelled by the user. Any already committed action cannot be undone.",
          completedAt,
        },
      });
      if (update.count === 0) return { kind: "not_cancellable" as const };

      await transaction.agentTaskStep.updateMany({
        where: { agentTaskId: id, status: { in: ["queued", "running"] } },
        data: { status: "cancelled", result: "Cancelled by the user.", completedAt },
      });
      return {
        kind: "cancelled" as const,
        task: await transaction.agentTask.findFirst({
          where: { id, userId },
          include: taskInclude,
        }),
      };
    });

    if (result.kind === "not_found") {
      agentError(response, 404, "AGENT_TASK_NOT_FOUND", "Agent task not found.");
      return;
    }
    if (result.kind === "not_cancellable") {
      agentError(
        response,
        409,
        "AGENT_TASK_NOT_CANCELLABLE",
        "This agent task is no longer running.",
      );
      return;
    }
    response.json({ success: true, data: result.task });
  } catch (error) {
    next(error);
  }
});
