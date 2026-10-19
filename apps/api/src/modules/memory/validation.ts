import { z } from "zod";

const containsCredential = (content: string | undefined) =>
  !content ||
  !/\b(password|api[_ -]?key|secret|access[_ -]?token|private[_ -]?key)\s*[:=]\s*\S+/i.test(
    content,
  );

export const memoryCategorySchema = z.enum(["preference", "workflow", "goal", "project", "fact"]);

export const memoryInputSchema = z
  .object({
    content: z.string().trim().min(1).max(1500),
    category: memoryCategorySchema.default("preference"),
    enabled: z.boolean().default(true),
  })
  .refine(({ content }) => containsCredential(content), {
    message: "Do not save passwords, API keys, or other secret credentials as memories.",
  });

export const memoryUpdateSchema = z
  .object({
    content: z.string().trim().min(1).max(1500).optional(),
    category: memoryCategorySchema.optional(),
    enabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one memory field to update.",
  })
  .refine(({ content }) => containsCredential(content), {
    message: "Do not save passwords, API keys, or other secret credentials as memories.",
  });
