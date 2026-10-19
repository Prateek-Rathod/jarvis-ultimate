import type { NextFunction, Request, Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { loadSession } from "../modules/auth/session.js";

export async function authenticate(request: Request, response: Response, next: NextFunction) {
  try {
    const session = await loadSession(request);
    if (!session) {
      response.status(401).json({
        success: false,
        error: { code: "UNAUTHENTICATED", message: "Please sign in to continue." },
        requestId: request.requestId,
      });
      return;
    }

    request.auth = {
      user: session.user,
      sessionId: session.id,
      csrfToken: session.csrfToken,
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireCsrf(request: Request, response: Response, next: NextFunction) {
  const supplied = request.get("x-csrf-token");
  const expected = request.auth?.csrfToken;
  if (!supplied || !expected) {
    response.status(403).json({
      success: false,
      error: { code: "CSRF_INVALID", message: "The security token is missing or invalid." },
      requestId: request.requestId,
    });
    return;
  }

  const suppliedHash = createHash("sha256").update(supplied).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  if (!timingSafeEqual(suppliedHash, expectedHash)) {
    response.status(403).json({
      success: false,
      error: { code: "CSRF_INVALID", message: "The security token is missing or invalid." },
      requestId: request.requestId,
    });
    return;
  }
  next();
}
