import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../database/client.js";
import { authenticate, requireCsrf } from "../../middleware/authentication.js";
import { taskInputSchema, taskUpdateSchema } from "./validation.js";

export const taskRouter = Router();
taskRouter.use(authenticate);

const taskListQuerySchema = z.object({
  status: z.enum(["open", "completed"]).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

taskRouter.get("/", async (request, response, next) => {
  try {
    const { status, cursor, limit } = taskListQuerySchema.parse(request.query);
    const tasks = await prisma.task.findMany({
      where: { userId: request.auth!.user.id, ...(status ? { status } : {}) },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }, { id: "asc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit + 1,
    });
    const hasMore = tasks.length > limit;
    const page = hasMore ? tasks.slice(0, limit) : tasks;
    response.json({
      success: true,
      data: {
        tasks: page,
        pagination: { nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null },
      },
    });
  } catch (error) {
    next(error);
  }
});

taskRouter.post("/", requireCsrf, async (request, response, next) => {
  try {
    const input = taskInputSchema.parse(request.body);
    const task = await prisma.task.create({
      data: {
        ...input,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        userId: request.auth!.user.id,
      },
    });
    response.status(201).json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
});

taskRouter.patch("/:id", requireCsrf, async (request, response, next) => {
  try {
    const id = z.string().uuid().parse(request.params.id);
    const input = taskUpdateSchema.parse(request.body);
    const existing = await prisma.task.findFirst({ where: { id, userId: request.auth!.user.id } });
    if (!existing) {
      response.status(404).json({
        success: false,
        error: { code: "TASK_NOT_FOUND", message: "Task not found." },
        requestId: request.requestId,
      });
      return;
    }
    const task = await prisma.task.update({
      where: { id },
      data: {
        ...input,
        ...(input.dueAt !== undefined ? { dueAt: input.dueAt ? new Date(input.dueAt) : null } : {}),
        ...(input.status ? { completedAt: input.status === "completed" ? new Date() : null } : {}),
      },
    });
    response.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
});

taskRouter.delete("/:id", requireCsrf, async (request, response, next) => {
  try {
    const id = z.string().uuid().parse(request.params.id);
    const result = await prisma.task.deleteMany({ where: { id, userId: request.auth!.user.id } });
    if (result.count === 0) {
      response.status(404).json({
        success: false,
        error: { code: "TASK_NOT_FOUND", message: "Task not found." },
        requestId: request.requestId,
      });
      return;
    }
    response.json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
});
