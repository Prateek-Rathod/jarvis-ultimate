import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../database/client.js";
import { authenticate, requireCsrf } from "../../middleware/authentication.js";
import { clearSessionCookie, createSession, hashToken } from "./session.js";
import { env } from "../../config/env.js";

export const authRouter = Router();

const credentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(1).max(80).optional(),
});

authRouter.post("/register", async (request, response, next) => {
  try {
    const input = credentialsSchema.parse(request.body);
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) {
      response.status(409).json({
        success: false,
        error: { code: "ACCOUNT_EXISTS", message: "An account with that email already exists." },
        requestId: request.requestId,
      });
      return;
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        displayName: input.displayName ?? input.email.split("@")[0],
        preferences: { create: {} },
      },
      select: { id: true, email: true, displayName: true, timezone: true },
    });
    const session = await createSession(user.id, response);

    response.status(201).json({
      success: true,
      data: { user, csrfToken: session.csrfToken, expiresAt: session.expiresAt },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", async (request, response, next) => {
  try {
    const input = credentialsSchema.pick({ email: true, password: true }).parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    const passwordMatches = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
    if (!user || !passwordMatches) {
      response.status(401).json({
        success: false,
        error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." },
        requestId: request.requestId,
      });
      return;
    }

    const session = await createSession(user.id, response);
    response.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          timezone: user.timezone,
        },
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/session", authenticate, async (request, response, next) => {
  try {
    const session = await prisma.session.findUnique({
      where: { id: request.auth!.sessionId },
      select: { expiresAt: true },
    });
    if (!session) {
      response.status(401).json({
        success: false,
        error: {
          code: "SESSION_EXPIRED",
          message: "Your session has expired. Please sign in again.",
        },
        requestId: request.requestId,
      });
      return;
    }
    response.json({
      success: true,
      data: {
        user: request.auth!.user,
        csrfToken: request.auth!.csrfToken,
        expiresAt: session.expiresAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", authenticate, requireCsrf, async (request, response, next) => {
  try {
    const token = request.cookies?.[env.SESSION_COOKIE_NAME] as string | undefined;
    if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    clearSessionCookie(response);
    response.json({ success: true, data: { signedOut: true } });
  } catch (error) {
    next(error);
  }
});
