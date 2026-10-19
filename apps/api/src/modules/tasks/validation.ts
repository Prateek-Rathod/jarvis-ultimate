import { z } from "zod";

export const taskInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  dueAt: z.string().datetime().optional().nullable(),
});

export const taskUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    dueAt: z.string().datetime().nullable().optional(),
    status: z.enum(["open", "completed"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one task field to update.",
  });
