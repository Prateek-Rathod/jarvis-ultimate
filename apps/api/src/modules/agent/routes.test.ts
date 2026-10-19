import type { NextFunction, Request, Response } from "express";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    agentTask: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    agentTaskStep: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    task: { create: vi.fn() },
  };
  return {
    transaction,
    agentEntitlementFindUnique: vi.fn(),
    agentTaskCreate: vi.fn(),
    agentTaskFindFirst: vi.fn(),
    agentTaskFindMany: vi.fn(),
    agentTaskDeleteMany: vi.fn(),
    interpretAgentInstruction: vi.fn(),
    transactionRun: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  };
});

vi.mock("../../database/client.js", () => ({
  prisma: {
    agentEntitlement: { findUnique: mocks.agentEntitlementFindUnique },
    agentTask: {
      create: mocks.agentTaskCreate,
      findFirst: mocks.agentTaskFindFirst,
      findMany: mocks.agentTaskFindMany,
      deleteMany: mocks.agentTaskDeleteMany,
    },
    $transaction: mocks.transactionRun,
  },
}));
vi.mock("../../config/env.js", () => ({
  env: { NODE_ENV: "development" },
}));
vi.mock("express-rate-limit", () => ({
  rateLimit: () => (_request: Request, _response: Response, next: NextFunction) => next(),
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
vi.mock("./intent.js", () => ({
  interpretAgentInstruction: mocks.interpretAgentInstruction,
}));

import { agentRouter } from "./routes.js";

const app = express();
app.use(express.json());
app.use("/agent", agentRouter);
app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  void _next;
  const validationError = error instanceof Error && error.name === "ZodError";
  response
    .status(validationError ? 400 : 500)
    .json({ error: validationError ? "VALIDATION_ERROR" : "INTERNAL_ERROR" });
});

const taskId = "d5436d73-fc15-47bf-844e-674de55e6201";
const idempotencyKey = "13ab38c4-2809-43ef-b29f-a339672621c0";
const enabledEntitlement = {
  status: "active",
  capabilities: ["agent_mode"],
  expiresAt: null,
};
const completedAgentTask = {
  id: taskId,
  userId: "authenticated-user",
  instruction: "Create task: Read Prisma docs",
  status: "completed",
  result: 'Added "Read Prisma docs" to your JARVIS task list.',
  steps: [],
};

describe("Agent Mode routes", () => {
  let server: ReturnType<typeof app.listen>;
  let origin: string;

  beforeAll(async () => {
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind.");
    origin = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    mocks.agentEntitlementFindUnique.mockReset();
    mocks.agentEntitlementFindUnique.mockResolvedValue(null);
    mocks.agentTaskCreate.mockReset();
    mocks.agentTaskFindFirst.mockReset();
    mocks.agentTaskFindMany.mockReset();
    mocks.agentTaskDeleteMany.mockReset();
    mocks.interpretAgentInstruction.mockReset();
    mocks.interpretAgentInstruction.mockResolvedValue(null);
    mocks.transactionRun.mockReset();
    mocks.transactionRun.mockImplementation(
      async (callback: (tx: typeof mocks.transaction) => unknown) => callback(mocks.transaction),
    );
    for (const method of Object.values(mocks.transaction.agentTask)) method.mockReset();
    for (const method of Object.values(mocks.transaction.agentTaskStep)) method.mockReset();
    mocks.transaction.task.create.mockReset();
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("reports local testing access and the supported tool list", async () => {
    const response = await fetch(`${origin}/agent/capabilities`);

    expect(response.status).toBe(200);
    const data = (await response.json()).data;
    expect(data).toMatchObject({
      enabled: true,
    });
    expect(data.tools).toEqual(
      expect.arrayContaining([
        {
          name: "create_task",
          description: expect.any(String),
          risk: "low",
          requiresConfirmation: false,
        },
        {
          name: "open_website",
          description: expect.any(String),
          risk: "low",
          requiresConfirmation: true,
        },
      ]),
    );
  });

  it("allows signed-in development accounts to run Agent Mode without paid entitlements", async () => {
    mocks.agentTaskFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(completedAgentTask);
    mocks.agentTaskCreate.mockResolvedValue({ id: taskId });
    mocks.transaction.agentTaskStep.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.agentTask.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.agentTaskStep.create.mockResolvedValue({});
    mocks.transaction.agentTask.findFirst.mockResolvedValue({ id: taskId });
    mocks.transaction.task.create.mockResolvedValue({
      id: "new-user-task",
      userId: "authenticated-user",
      title: "Read Prisma docs",
    });
    const response = await fetch(`${origin}/agent/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ instruction: "Create task: Read Prisma docs" }),
    });

    expect(response.status).toBe(201);
    expect(mocks.agentTaskCreate).toHaveBeenCalled();
    expect(mocks.agentEntitlementFindUnique).toHaveBeenCalled();
  });

  it("stores website navigation as pending confirmation and only completes after confirmation", async () => {
    const pendingTask = {
      ...completedAgentTask,
      instruction: "Open YouTube",
      status: "awaiting_approval",
      result: JSON.stringify({
        type: "navigation_confirmation",
        url: "https://www.youtube.com/",
        label: "YouTube",
      }),
      steps: [],
    };
    const completedTask = {
      ...pendingTask,
      status: "completed",
      result: "The browser opened YouTube in a new tab.",
    };
    mocks.agentTaskFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(pendingTask);
    mocks.agentEntitlementFindUnique.mockResolvedValue(enabledEntitlement);
    mocks.agentTaskCreate.mockResolvedValue({ id: taskId });
    mocks.transaction.agentTaskStep.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.agentTask.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.agentTaskStep.create.mockResolvedValue({});

    const createResponse = await fetch(`${origin}/agent/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ instruction: "Open YouTube" }),
    });
    expect(createResponse.status).toBe(201);
    expect((await createResponse.json()).data).toMatchObject({
      status: "awaiting_approval",
      result: pendingTask.result,
    });
    expect(mocks.transaction.agentTaskStep.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tool: "open_website", status: "awaiting_approval" }),
      }),
    );

    mocks.agentTaskFindFirst
      .mockResolvedValueOnce(pendingTask)
      .mockResolvedValueOnce(completedTask);
    mocks.transaction.agentTask.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.agentTaskStep.updateMany.mockResolvedValue({ count: 1 });
    const confirmResponse = await fetch(`${origin}/agent/tasks/${taskId}/confirm-navigation`, {
      method: "POST",
    });

    expect(confirmResponse.status).toBe(200);
    expect((await confirmResponse.json()).data.status).toBe("completed");
  });

  it("returns existing tasks only within the authenticated user's scope", async () => {
    mocks.agentTaskFindFirst.mockResolvedValue(null);
    const response = await fetch(`${origin}/agent/tasks/${taskId}`);

    expect(response.status).toBe(404);
    expect(mocks.agentTaskFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: taskId, userId: "authenticated-user" } }),
    );
  });

  it("does not reuse an idempotency key for a different instruction", async () => {
    mocks.agentTaskFindFirst.mockResolvedValue({
      ...completedAgentTask,
      instruction: "Create task: Something else",
    });

    const response = await fetch(`${origin}/agent/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ instruction: "Create task: Read Prisma docs" }),
    });

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(mocks.agentTaskCreate).not.toHaveBeenCalled();
  });

  it("returns an existing execution when the same instruction is retried", async () => {
    mocks.agentTaskFindFirst.mockResolvedValue(completedAgentTask);
    const response = await fetch(`${origin}/agent/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ instruction: completedAgentTask.instruction }),
    });

    expect(response.status).toBe(200);
    expect((await response.json()).data.id).toBe(taskId);
    expect(mocks.agentTaskCreate).not.toHaveBeenCalled();
  });

  it("persists unsupported requests without invoking any action tool", async () => {
    mocks.agentTaskFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      ...completedAgentTask,
      status: "unsupported",
      result: "This action is not supported.",
    });
    mocks.agentTaskCreate.mockResolvedValue({ id: taskId });
    mocks.transaction.agentTaskStep.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.agentTask.updateMany.mockResolvedValue({ count: 1 });

    const response = await fetch(`${origin}/agent/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ instruction: "Open Chrome and launch my project" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.data.status).toBe("unsupported");
    expect(mocks.transaction.task.create).not.toHaveBeenCalled();
  });

  it("creates the supported task action transactionally and verifies its result", async () => {
    const detail = {
      ...completedAgentTask,
      steps: [{ position: 1, status: "completed", result: "Added task." }],
    };
    mocks.agentTaskFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(detail);
    mocks.agentEntitlementFindUnique.mockResolvedValue(enabledEntitlement);
    mocks.agentTaskCreate.mockResolvedValue({ id: taskId });
    mocks.transaction.agentTask.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.agentTaskStep.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.agentTaskStep.create.mockResolvedValue({});
    mocks.transaction.agentTask.findFirst.mockResolvedValue({ id: taskId });
    mocks.transaction.task.create.mockResolvedValue({
      id: "new-user-task",
      userId: "authenticated-user",
      title: "Read Prisma docs",
    });

    const response = await fetch(`${origin}/agent/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ instruction: "Create task: Read Prisma docs" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.data.status).toBe("completed");
    expect(mocks.transaction.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { userId: "authenticated-user", title: "Read Prisma docs" },
      }),
    );
    expect(mocks.agentTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "authenticated-user",
          idempotencyKey,
          instruction: "Create task: Read Prisma docs",
        }),
      }),
    );
  });

  it("validates and executes a structured natural-language task plan through the fixed registry", async () => {
    const detail = {
      ...completedAgentTask,
      instruction: "Make sure I remember to revise DBMS",
    };
    mocks.interpretAgentInstruction.mockResolvedValue({
      kind: "execute",
      plan: { tool: "create_task", arguments: { title: "revise DBMS" } },
    });
    mocks.agentTaskFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(detail);
    mocks.agentEntitlementFindUnique.mockResolvedValue(enabledEntitlement);
    mocks.agentTaskCreate.mockResolvedValue({ id: taskId });
    mocks.transaction.agentTask.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.agentTaskStep.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.agentTaskStep.create.mockResolvedValue({});
    mocks.transaction.agentTask.findFirst.mockResolvedValue({ id: taskId });
    mocks.transaction.task.create.mockResolvedValue({
      id: "new-user-task",
      userId: "authenticated-user",
      title: "revise DBMS",
    });

    const response = await fetch(`${origin}/agent/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ instruction: "Make sure I remember to revise DBMS" }),
    });

    expect(response.status).toBe(201);
    expect((await response.json()).data.status).toBe("completed");
    expect(mocks.interpretAgentInstruction).toHaveBeenCalledWith(
      "Make sure I remember to revise DBMS",
    );
    expect(mocks.transaction.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { userId: "authenticated-user", title: "revise DBMS" },
      }),
    );
  });

  it("cancels only a running task owned by the signed-in user", async () => {
    const cancelled = { ...completedAgentTask, status: "cancelled" };
    mocks.transaction.agentTask.findFirst
      .mockResolvedValueOnce({ status: "running" })
      .mockResolvedValueOnce(cancelled);
    mocks.transaction.agentTask.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.agentTaskStep.updateMany.mockResolvedValue({ count: 1 });

    const response = await fetch(`${origin}/agent/tasks/${taskId}/cancel`, { method: "POST" });

    expect(response.status).toBe(200);
    expect((await response.json()).data.status).toBe("cancelled");
    expect(mocks.transaction.agentTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: taskId,
          userId: "authenticated-user",
          status: { in: ["planning", "running", "awaiting_approval"] },
        },
      }),
    );
  });

  it("deletes only a terminal agent-task history record owned by the user", async () => {
    mocks.agentTaskDeleteMany.mockResolvedValue({ count: 1 });
    const response = await fetch(`${origin}/agent/tasks/${taskId}`, { method: "DELETE" });

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ deleted: true });
    expect(mocks.agentTaskDeleteMany).toHaveBeenCalledWith({
      where: {
        id: taskId,
        userId: "authenticated-user",
        status: {
          notIn: ["queued", "planning", "running", "awaiting_approval", "verifying"],
        },
      },
    });
  });
});
