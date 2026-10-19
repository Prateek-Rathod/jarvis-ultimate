import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";

describe("API security and liveness", () => {
  let app: ReturnType<typeof createApp>;
  let server: Server;
  let origin: string;
  let databaseAvailable = true;

  beforeAll(async () => {
    app = createApp(async () => {
      if (!databaseAvailable) throw new Error("database unavailable");
    }, 1);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("returns a minimal live health check", async () => {
    const response = await fetch(`${origin}/health/live`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("trusts the configured proxy hop count before rate-limited routes", async () => {
    expect(app.get("trust proxy")).toBe(1);
    const rateLimitError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await fetch(`${origin}/api/v1/auth/session`, {
        headers: { "X-Forwarded-For": "198.51.100.23" },
      });
      expect(response.status).toBe(401);
      expect(rateLimitError).not.toHaveBeenCalled();
    } finally {
      rateLimitError.mockRestore();
    }
  });

  it("answers credentialed CORS preflight for the exact configured origin", async () => {
    const response = await fetch(`${origin}/api/v1/auth/login`, {
      method: "OPTIONS",
      headers: {
        Origin: env.WEB_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-csrf-token",
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(env.WEB_ORIGIN);
    expect(response.headers.get("access-control-allow-origin")).not.toBe("*");
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).toContain(
      "x-csrf-token",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("does not grant CORS access to another origin", async () => {
    const response = await fetch(`${origin}/api/v1/auth/session`, {
      headers: { Origin: "https://untrusted.example" },
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("access-control-allow-origin")).toBe(env.WEB_ORIGIN);
    expect(response.headers.get("access-control-allow-origin")).not.toBe(
      "https://untrusted.example",
    );
  });

  it("reports database readiness and returns 503 when the database probe fails", async () => {
    const ready = await fetch(`${origin}/health/ready`);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({
      status: "ready",
      dependencies: { database: "available" },
    });

    databaseAvailable = false;
    const readinessError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const unavailable = await fetch(`${origin}/health/ready`);
      expect(unavailable.status).toBe(503);
      expect(await unavailable.json()).toEqual({
        status: "not_ready",
        dependencies: { database: "unavailable" },
      });
      expect(readinessError).toHaveBeenCalledTimes(1);
      const diagnostic = JSON.parse(readinessError.mock.calls[0][0] as string) as {
        message: string;
      };
      expect(diagnostic.message).toBe("Database readiness probe failed");
      expect(readinessError.mock.calls[0][0]).not.toContain("database unavailable");
    } finally {
      readinessError.mockRestore();
      databaseAvailable = true;
    }
  });

  it("reports a logged-out session as unauthenticated", async () => {
    const response = await fetch(`${origin}/api/v1/auth/session`);
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");

    const preferences = await fetch(`${origin}/api/v1/preferences`);
    expect(preferences.status).toBe(401);
    expect((await preferences.json()).error.code).toBe("UNAUTHENTICATED");

    const agentCapabilities = await fetch(`${origin}/api/v1/agent/capabilities`);
    expect(agentCapabilities.status).toBe(401);
    expect((await agentCapabilities.json()).error.code).toBe("UNAUTHENTICATED");

    const agentAction = await fetch(`${origin}/api/v1/agent/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "13ab38c4-2809-43ef-b29f-a339672621c0",
      },
      body: JSON.stringify({ instruction: "Create task: Unauthorized action" }),
    });
    expect(agentAction.status).toBe(401);
    expect((await agentAction.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects state-changing requests from an untrusted origin", async () => {
    const response = await fetch(`${origin}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://attacker.invalid" },
      body: JSON.stringify({ email: "user@example.com", password: "not-a-real-password" }),
    });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("ORIGIN_NOT_ALLOWED");
  });
});
