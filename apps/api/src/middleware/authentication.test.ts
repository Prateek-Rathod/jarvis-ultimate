import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { loadSession } = vi.hoisted(() => ({ loadSession: vi.fn() }));
vi.mock("../modules/auth/session.js", () => ({ loadSession }));

import { authenticate } from "./authentication.js";

describe("authentication middleware", () => {
  const app = express();
  app.get("/protected", authenticate, (request, response) => {
    response.json({ userId: request.auth?.user.id });
  });
  let server: ReturnType<typeof app.listen>;
  let origin: string;

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

  it("rejects a protected request when no session exists", async () => {
    loadSession.mockResolvedValueOnce(null);
    const response = await fetch(`${origin}/protected`);
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("allows a request with an authenticated user", async () => {
    loadSession.mockResolvedValueOnce({
      id: "session-id",
      csrfToken: "csrf-token",
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: "user-id",
        email: "user@example.test",
        displayName: "Test User",
        timezone: "UTC",
      },
    });
    const response = await fetch(`${origin}/protected`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: "user-id" });
  });
});
