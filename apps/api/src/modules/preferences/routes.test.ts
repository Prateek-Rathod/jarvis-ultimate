import type { NextFunction, Request, Response } from "express";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("../../database/client.js", () => ({
  prisma: { userPreference: { findUnique: mocks.findUnique, upsert: mocks.upsert } },
}));
vi.mock("../../middleware/authentication.js", () => ({
  authenticate: (request: Request, _response: Response, next: NextFunction) => {
    request.auth = {
      user: {
        id: "authenticated-user",
        email: "user@example.test",
        displayName: "Test User",
        timezone: "UTC",
      },
      sessionId: "session-id",
      csrfToken: "csrf-token",
    };
    next();
  },
  requireCsrf: (_request: Request, _response: Response, next: NextFunction) => next(),
}));

import { preferenceRouter } from "./routes.js";

const app = express();
app.use(express.json());
app.use("/preferences", preferenceRouter);
app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  void _next;
  const validationError = error instanceof Error && error.name === "ZodError";
  response
    .status(validationError ? 400 : 500)
    .json({ error: validationError ? "VALIDATION_ERROR" : "INTERNAL_ERROR" });
});

describe("user preferences routes", () => {
  let server: ReturnType<typeof app.listen>;
  let origin: string;

  beforeEach(() => {
    mocks.findUnique.mockReset();
    mocks.upsert.mockReset();
  });

  beforeAll(async () => {
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind.");
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("returns safe defaults when the user has no saved preferences", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const response = await fetch(`${origin}/preferences`);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({
      theme: "system",
      responseStyle: "balanced",
      memoryEnabled: false,
      autoSpeak: false,
      speechRate: 1,
      speechPitch: 1,
      speechVoice: null,
      reduceMotion: false,
    });
    expect(mocks.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "authenticated-user" } }),
    );
  });

  it("persists only validated settings for the authenticated user", async () => {
    const saved = {
      theme: "dark",
      responseStyle: "concise",
      memoryEnabled: false,
      autoSpeak: true,
      speechRate: 1.1,
      speechPitch: 1,
      speechVoice: null,
      reduceMotion: false,
    };
    mocks.upsert.mockResolvedValue(saved);
    const response = await fetch(`${origin}/preferences`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoSpeak: true, speechRate: 1.1 }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual(saved);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "authenticated-user" },
        update: { autoSpeak: true, speechRate: 1.1 },
      }),
    );
  });

  it.each([
    { theme: "ultraviolet" },
    { speechRate: 4 },
    { autoSpeak: true, arbitrary: "property" },
    {},
  ])("rejects invalid preference updates: %j", async (body) => {
    const response = await fetch(`${origin}/preferences`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
