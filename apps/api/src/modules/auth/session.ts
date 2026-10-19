import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions, Request, Response } from "express";
import { env } from "../../config/env.js";
import { prisma } from "../../database/client.js";

export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE || env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/",
};

export async function createSession(userId: string, response: Response) {
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);
  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      csrfToken,
      expiresAt,
    },
  });

  response.cookie(env.SESSION_COOKIE_NAME, token, {
    ...cookieOptions,
    expires: expiresAt,
  });

  return { id: session.id, csrfToken, expiresAt };
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(env.SESSION_COOKIE_NAME, cookieOptions);
}

export async function loadSession(request: Request) {
  const token = request.cookies?.[env.SESSION_COOKIE_NAME] as string | undefined;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      csrfToken: true,
      expiresAt: true,
      user: { select: { id: true, email: true, displayName: true, timezone: true } },
    },
  });

  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.session.delete({ where: { id: session.id } });
    return null;
  }
  return { ...session };
}
