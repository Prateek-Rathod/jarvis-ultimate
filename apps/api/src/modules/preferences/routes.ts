import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../database/client.js";
import { authenticate, requireCsrf } from "../../middleware/authentication.js";

export const preferenceRouter = Router();
preferenceRouter.use(authenticate);

const preferenceFields = {
  theme: true,
  responseStyle: true,
  memoryEnabled: true,
  autoSpeak: true,
  speechRate: true,
  speechPitch: true,
  speechVoice: true,
  reduceMotion: true,
} as const;

const preferenceUpdateSchema = z
  .object({
    theme: z.enum(["dark", "light", "system"]).optional(),
    responseStyle: z.enum(["concise", "balanced", "detailed"]).optional(),
    memoryEnabled: z.boolean().optional(),
    autoSpeak: z.boolean().optional(),
    speechRate: z.number().min(0.5).max(2).optional(),
    speechPitch: z.number().min(0.5).max(2).optional(),
    speechVoice: z.string().trim().min(1).max(256).nullable().optional(),
    reduceMotion: z.boolean().optional(),
  })
  .strict()
  .refine((preferences) => Object.keys(preferences).length > 0, {
    message: "At least one preference must be provided.",
  });

preferenceRouter.get("/", async (request, response, next) => {
  try {
    const preferences = await prisma.userPreference.findUnique({
      where: { userId: request.auth!.user.id },
      select: preferenceFields,
    });
    response.json({
      success: true,
      data: preferences ?? {
        theme: "system",
        responseStyle: "balanced",
        memoryEnabled: false,
        autoSpeak: false,
        speechRate: 1,
        speechPitch: 1,
        speechVoice: null,
        reduceMotion: false,
      },
    });
  } catch (error) {
    next(error);
  }
});

preferenceRouter.patch("/", requireCsrf, async (request, response, next) => {
  try {
    const preferences = preferenceUpdateSchema.parse(request.body);
    const saved = await prisma.userPreference.upsert({
      where: { userId: request.auth!.user.id },
      update: preferences,
      create: { userId: request.auth!.user.id, memoryEnabled: false, ...preferences },
      select: preferenceFields,
    });
    response.json({ success: true, data: saved });
  } catch (error) {
    next(error);
  }
});
