import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./database/client.js";
import { startApiServer } from "./server-lifecycle.js";

const databaseName = new URL(env.DATABASE_URL).pathname.slice(1);
const integrationEnabled =
  process.env.JARVIS_DATABASE_INTEGRATION === "1" && /(?:_test|_integration)$/i.test(databaseName);
const postgresDescribe = integrationEnabled ? describe : describe.skip;

postgresDescribe("PostgreSQL API integration", () => {
  let server: Server;
  let origin: string;
  const testEmails = [
    `owner-${randomUUID()}@integration.test`,
    `other-${randomUUID()}@integration.test`,
  ];
  const testPassword = "Integration-test-password-123";

  beforeAll(async () => {
    server = await startApiServer({
      port: 0,
      initializeDatabase: async () => {
        await prisma.$connect();
        await prisma.$queryRaw`SELECT 1`;
      },
      listen: (port) => app.listen(port),
    });
    const address = server.address() as AddressInfo;
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
    await prisma.$disconnect();
  });

  it("authenticates registered users and isolates conversation history by owner", async () => {
    async function register(email: string) {
      const response = await fetch(`${origin}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: testPassword,
          displayName: "Integration Test",
        }),
      });
      expect(response.status).toBe(201);
      const payload = (await response.json()) as {
        data: { user: { id: string }; csrfToken: string };
      };
      const cookie = response.headers.get("set-cookie")?.split(";")[0];
      if (!cookie) throw new Error("Registration did not set a session cookie.");
      return { cookie, ...payload.data };
    }

    const owner = await register(testEmails[0]);
    const other = await register(testEmails[1]);
    const login = await fetch(`${origin}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmails[0], password: testPassword }),
    });
    expect(login.status).toBe(200);
    const loginCookie = login.headers.get("set-cookie")?.split(";")[0];
    if (!loginCookie) throw new Error("Login did not set a session cookie.");

    const session = await fetch(`${origin}/api/v1/auth/session`, {
      headers: { Cookie: loginCookie },
    });
    expect(session.status).toBe(200);
    expect((await session.json()).data.user.id).toBe(owner.user.id);

    const created = await fetch(`${origin}/api/v1/conversations`, {
      method: "POST",
      headers: {
        Cookie: owner.cookie,
        "Content-Type": "application/json",
        "X-CSRF-Token": owner.csrfToken,
      },
      body: JSON.stringify({}),
    });
    expect(created.status).toBe(201);
    const conversationId = (await created.json()).data.id as string;

    const ownerMessages = await fetch(`${origin}/api/v1/conversations/${conversationId}/messages`, {
      headers: { Cookie: owner.cookie },
    });
    expect(ownerMessages.status).toBe(200);

    const otherMessages = await fetch(`${origin}/api/v1/conversations/${conversationId}/messages`, {
      headers: { Cookie: other.cookie },
    });
    expect(otherMessages.status).toBe(404);
    expect((await otherMessages.json()).error.code).toBe("CONVERSATION_NOT_FOUND");
  });
});
