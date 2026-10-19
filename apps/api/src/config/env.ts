import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: process.env.ENV_FILE ?? "../../.env" });

const webOriginSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    );
  }, "WEB_ORIGIN must be an HTTP(S) origin without a path, query, or credentials.")
  .transform((value) => new URL(value).origin);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  WEB_ORIGIN: webOriginSchema.default("http://localhost:5173"),
  API_PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(Number(process.env.PORT) || 3001),
  TRUST_PROXY_HOPS: z.coerce
    .number()
    .int()
    .min(0)
    .default(process.env.NODE_ENV === "production" ? 1 : 0),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_COOKIE_NAME: z.string().default("jarvis_session"),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(168),
  COOKIE_SECURE: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
  AI_BASE_URL: z.string().url().optional().or(z.literal("")),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("Invalid environment configuration:", parsedEnv.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsedEnv.data;
