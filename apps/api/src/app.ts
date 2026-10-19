import { randomUUID } from "node:crypto";
import express, { type ErrorRequestHandler } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { prisma } from "./database/client.js";
import { requestContext } from "./middleware/request-context.js";
import { authRouter } from "./modules/auth/routes.js";
import { taskRouter } from "./modules/tasks/routes.js";
import { conversationRouter } from "./modules/conversations/routes.js";
import { memoryRouter } from "./modules/memory/routes.js";
import { dashboardRouter } from "./modules/dashboard/routes.js";

export function createApp(
  databaseProbe: () => Promise<unknown> = () => prisma.$queryRaw`SELECT 1`,
) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());
  app.use(requestContext);
  app.use((request, response, next) => {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) {
      const origin = request.get("origin");
      if (origin && origin !== env.WEB_ORIGIN) {
        response.status(403).json({
          success: false,
          error: { code: "ORIGIN_NOT_ALLOWED", message: "Request origin is not allowed." },
          requestId: request.requestId,
        });
        return;
      }
    }
    next();
  });

  app.get("/health/live", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.get("/health/ready", async (_request, response) => {
    try {
      await databaseProbe();
      response.json({ status: "ready", dependencies: { database: "available" } });
    } catch {
      response.status(503).json({ status: "not_ready", dependencies: { database: "unavailable" } });
    }
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  app.use("/api/v1/auth", authLimiter, authRouter);
  app.use("/api/v1/tasks", taskRouter);
  app.use("/api/v1/conversations", conversationRouter);
  app.use("/api/v1/memories", memoryRouter);
  app.use("/api/v1/dashboard", dashboardRouter);

  app.use((_request, response) => {
    response.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "The requested resource was not found." },
    });
  });

  const errorHandler: ErrorRequestHandler = (error: unknown, request, response, next) => {
    void next;
    if (error instanceof ZodError) {
      response.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "The request contains invalid data.",
          details: error.flatten(),
        },
        requestId: request.requestId,
      });
      return;
    }

    const requestId = request.requestId ?? randomUUID();
    const errorCode =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string" &&
      /^[A-Z][A-Z0-9_]{0,31}$/.test(error.code)
        ? error.code
        : undefined;
    console.error(
      JSON.stringify({
        level: "error",
        requestId,
        name: error instanceof Error ? error.name : "UnknownError",
        code: errorCode,
        message: "Request failed",
      }),
    );
    response.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "An unexpected server error occurred." },
      requestId,
    });
  };
  app.use(errorHandler);

  return app;
}

export const app = createApp();
