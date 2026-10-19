import dotenv from "dotenv";
import { defineConfig, env } from "prisma/config";

dotenv.config({ path: process.env.ENV_FILE ?? "../../.env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
