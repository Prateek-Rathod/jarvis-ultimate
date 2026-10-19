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
  const testUserIds: string[] = [];
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
    if (testUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
    }
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
      testUserIds.push(payload.data.user.id);
      const cookie = response.headers.get("set-cookie")?.split(";")[0];
      if (!cookie) throw new Error("Registration did not set a session cookie.");
      const setCookie = response.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Strict");
      expect(setCookie).toContain("Path=/");
      expect(setCookie).not.toMatch(/;\s*Domain=/i);
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
    const loginPayload = (await login.json()) as { data: { csrfToken: string } };
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
        Cookie: loginCookie,
        "Content-Type": "application/json",
        "X-CSRF-Token": loginPayload.data.csrfToken,
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

    const invalidCsrf = await fetch(`${origin}/api/v1/conversations`, {
      method: "POST",
      headers: {
        Cookie: loginCookie,
        "Content-Type": "application/json",
        "X-CSRF-Token": "incorrect-token",
      },
      body: JSON.stringify({}),
    });
    expect(invalidCsrf.status).toBe(403);
    expect((await invalidCsrf.json()).error.code).toBe("CSRF_INVALID");

    await prisma.task.createMany({
      data: Array.from({ length: 101 }, (_, index) => ({
        userId: owner.user.id,
        title: `Pagination task ${index}`,
      })),
    });
    const listedTasks: string[] = [];
    let taskCursor: string | null = null;
    do {
      const query = new URLSearchParams({ limit: "50" });
      if (taskCursor) query.set("cursor", taskCursor);
      const taskPage = await fetch(`${origin}/api/v1/tasks?${query}`, {
        headers: { Cookie: loginCookie },
      });
      expect(taskPage.status).toBe(200);
      const payload = (await taskPage.json()).data as {
        tasks: Array<{ id: string }>;
        pagination: { nextCursor: string | null };
      };
      listedTasks.push(...payload.tasks.map(({ id }) => id));
      taskCursor = payload.pagination.nextCursor;
    } while (taskCursor);
    expect(listedTasks).toHaveLength(101);
    expect(new Set(listedTasks).size).toBe(101);

    const agentInstruction = "Create task: Review Agent Mode action";
    const idempotencyKey = randomUUID();
    const createAgentTask = () =>
      fetch(`${origin}/api/v1/agent/tasks`, {
        method: "POST",
        headers: {
          Cookie: loginCookie,
          "Content-Type": "application/json",
          "X-CSRF-Token": loginPayload.data.csrfToken,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ instruction: agentInstruction }),
      });
    const createdAgentTask = await createAgentTask();
    expect(createdAgentTask.status).toBe(201);
    const createdAgentTaskData = (await createdAgentTask.json()).data as {
      id: string;
      status: string;
    };
    expect(createdAgentTaskData.status).toBe("completed");

    const retriedAgentTask = await createAgentTask();
    expect(retriedAgentTask.status).toBe(200);
    expect((await retriedAgentTask.json()).data.id).toBe(createdAgentTaskData.id);
    expect(
      await prisma.task.count({
        where: { userId: owner.user.id, title: "Review Agent Mode action" },
      }),
    ).toBe(1);

    const ownerAgentHistory = await fetch(`${origin}/api/v1/agent/tasks`, {
      headers: { Cookie: loginCookie },
    });
    expect(ownerAgentHistory.status).toBe(200);
    expect((await ownerAgentHistory.json()).data).toHaveLength(1);

    const otherCapabilities = await fetch(`${origin}/api/v1/agent/capabilities`, {
      headers: { Cookie: other.cookie },
    });
    expect(otherCapabilities.status).toBe(200);
    const capabilitiesData = (await otherCapabilities.json()).data as {
      enabled: boolean;
    };
    expect(capabilitiesData.enabled).toBe(true);

    const otherTasks = await fetch(`${origin}/api/v1/tasks`, {
      headers: { Cookie: other.cookie },
    });
    expect(otherTasks.status).toBe(200);
    expect((await otherTasks.json()).data.tasks).toHaveLength(0);

    const otherAgentHistory = await fetch(`${origin}/api/v1/agent/tasks`, {
      headers: { Cookie: other.cookie },
    });
    expect(otherAgentHistory.status).toBe(200);
    expect((await otherAgentHistory.json()).data).toHaveLength(0);

    const otherAgentTask = await fetch(`${origin}/api/v1/agent/tasks/${createdAgentTaskData.id}`, {
      headers: { Cookie: other.cookie },
    });
    expect(otherAgentTask.status).toBe(404);

    const unauthorizedAgentExecution = await fetch(`${origin}/api/v1/agent/tasks`, {
      method: "POST",
      headers: {
        Cookie: other.cookie,
        "Content-Type": "application/json",
        "X-CSRF-Token": other.csrfToken,
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({ instruction: agentInstruction }),
    });
    expect(unauthorizedAgentExecution.status).toBe(201);
    const otherExecution = (await unauthorizedAgentExecution.json()).data as {
      id: string;
      status: string;
    };
    expect(otherExecution.status).toBe("completed");
    expect(
      await prisma.task.count({
        where: { userId: other.user.id, title: "Review Agent Mode action" },
      }),
    ).toBe(1);

    const unauthorizedCancellation = await fetch(
      `${origin}/api/v1/agent/tasks/${createdAgentTaskData.id}/cancel`,
      {
        method: "POST",
        headers: { Cookie: other.cookie, "X-CSRF-Token": other.csrfToken },
      },
    );
    expect(unauthorizedCancellation.status).toBe(404);

    const deletedAgentHistory = await fetch(
      `${origin}/api/v1/agent/tasks/${createdAgentTaskData.id}`,
      {
        method: "DELETE",
        headers: { Cookie: loginCookie, "X-CSRF-Token": loginPayload.data.csrfToken },
      },
    );
    expect(deletedAgentHistory.status).toBe(200);
  });
});
