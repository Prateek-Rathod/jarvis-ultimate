import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../database/client.js";
import { authenticate, requireCsrf } from "../../middleware/authentication.js";
import { memoryInputSchema, memoryUpdateSchema } from "./validation.js";

export const memoryRouter = Router();
memoryRouter.use(authenticate);

memoryRouter.get("/", async (request, response, next) => {
  try {
    const memories = await prisma.memory.findMany({
      where: { userId: request.auth!.user.id },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        content: true,
        category: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    response.json({ success: true, data: memories });
  } catch (error) {
    next(error);
  }
});

memoryRouter.post("/", requireCsrf, async (request, response, next) => {
  try {
    const input = memoryInputSchema.parse(request.body);
    const memory = await prisma.memory.create({
      data: { ...input, userId: request.auth!.user.id },
      select: {
        id: true,
        content: true,
        category: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    response.status(201).json({ success: true, data: memory });
  } catch (error) {
    next(error);
  }
});

memoryRouter.get("/settings", async (request, response, next) => {
  try {
    const preference = await prisma.userPreference.findUnique({
      where: { userId: request.auth!.user.id },
      select: { memoryEnabled: true },
    });
    response.json({ success: true, data: { enabled: preference?.memoryEnabled ?? false } });
  } catch (error) {
    next(error);
  }
});

memoryRouter.patch("/settings", requireCsrf, async (request, response, next) => {
  try {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(request.body);
    const preference = await prisma.userPreference.upsert({
      where: { userId: request.auth!.user.id },
      update: { memoryEnabled: enabled },
      create: { userId: request.auth!.user.id, memoryEnabled: enabled },
      select: { memoryEnabled: true },
    });
    response.json({ success: true, data: { enabled: preference.memoryEnabled } });
  } catch (error) {
    next(error);
  }
});

memoryRouter.patch("/:id", requireCsrf, async (request, response, next) => {
  try {
    const id = z.string().uuid().parse(request.params.id);
    const input = memoryUpdateSchema.parse(request.body);
    const existing = await prisma.memory.findFirst({
      where: { id, userId: request.auth!.user.id },
      select: { id: true },
    });
    if (!existing) {
      response.status(404).json({
        success: false,
        error: { code: "MEMORY_NOT_FOUND", message: "Memory not found." },
        requestId: request.requestId,
      });
      return;
    }
    const memory = await prisma.memory.update({
      where: { id },
      data: input,
      select: {
        id: true,
        content: true,
        category: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    response.json({ success: true, data: memory });
  } catch (error) {
    next(error);
  }
});

memoryRouter.delete("/:id", requireCsrf, async (request, response, next) => {
  try {
    const id = z.string().uuid().parse(request.params.id);
    const result = await prisma.memory.deleteMany({
      where: { id, userId: request.auth!.user.id },
    });
    if (!result.count) {
      response.status(404).json({
        success: false,
        error: { code: "MEMORY_NOT_FOUND", message: "Memory not found." },
        requestId: request.requestId,
      });
      return;
    }
    response.json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
});
