import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function requestContext(request: Request, response: Response, next: NextFunction) {
  const requestId = randomUUID();
  request.requestId = requestId;
  response.setHeader("X-Request-Id", requestId);
  const startedAt = Date.now();

  response.on("finish", () => {
    console.info(
      JSON.stringify({
        level: "info",
        requestId,
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMs: Date.now() - startedAt,
      }),
    );
  });

  next();
}
