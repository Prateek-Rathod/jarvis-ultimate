import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "./app.js";

describe("API security and liveness", () => {
  let server: Server;
  let origin: string;
  let databaseAvailable = true;

  beforeAll(async () => {
    const app = createApp(async () => {
      if (!databaseAvailable) throw new Error("database unavailable");
    });
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

  it("reports database readiness and returns 503 when the database probe fails", async () => {
    const ready = await fetch(`${origin}/health/ready`);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({
      status: "ready",
      dependencies: { database: "available" },
    });

    databaseAvailable = false;
    const unavailable = await fetch(`${origin}/health/ready`);
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({
      status: "not_ready",
      dependencies: { database: "unavailable" },
    });
    databaseAvailable = true;
  });

  it("reports a logged-out session as unauthenticated", async () => {
    const response = await fetch(`${origin}/api/v1/auth/session`);
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
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
