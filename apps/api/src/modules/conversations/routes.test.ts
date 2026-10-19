import type { NextFunction, Request, Response as ExpressResponse } from "express";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    AI_API_KEY: "test-groq-key",
    AI_BASE_URL: "https://api.groq.com/openai/v1",
    AI_MODEL: "openai/gpt-oss-120b",
  },
  conversationFindFirst: vi.fn(),
  conversationUpdate: vi.fn(),
  messageCreate: vi.fn(),
  messageFindMany: vi.fn(),
  preferenceFindUnique: vi.fn(),
  providerFetch: vi.fn(),
}));

vi.mock("../../config/env.js", () => ({ env: mocks.env }));
vi.mock("../../database/client.js", () => ({
  prisma: {
    conversation: {
      findFirst: mocks.conversationFindFirst,
      update: mocks.conversationUpdate,
    },
    message: {
      create: mocks.messageCreate,
      findMany: mocks.messageFindMany,
    },
    userPreference: { findUnique: mocks.preferenceFindUnique },
  },
}));
vi.mock("../../middleware/authentication.js", () => ({
  authenticate: (_request: Request, _response: ExpressResponse, next: NextFunction) => {
    _request.auth = {
      user: {
        id: "user-id",
        email: "user@example.com",
        displayName: "Test User",
        timezone: "UTC",
      },
      sessionId: "test-session",
      csrfToken: "test-csrf",
    };
    next();
  },
  requireCsrf: (_request: Request, _response: ExpressResponse, next: NextFunction) => next(),
}));

import { conversationRouter } from "./routes.js";

const nativeFetch = globalThis.fetch;
const conversationId = "bfcc0c81-737f-4f58-93e0-7a0c94f9d13e";
const privatePrompt = "please keep this private test prompt";
const app = express();
app.use(express.json());
app.use((request, _response, next) => {
  request.requestId = "test-request";
  next();
});
app.use("/conversations", conversationRouter);
app.use((error: unknown, _request: Request, response: ExpressResponse, _next: NextFunction) => {
  void _next;
  response.status(500).json({ error: error instanceof Error ? error.message : "unknown" });
});

describe("conversation provider streaming", () => {
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

  beforeEach(() => {
    mocks.conversationFindFirst.mockResolvedValue({ id: conversationId });
    mocks.conversationUpdate.mockResolvedValue({});
    mocks.messageCreate.mockReset();
    mocks.messageCreate
      .mockResolvedValueOnce({ id: "user-message" })
      .mockResolvedValueOnce({ id: "assistant-message" });
    mocks.messageFindMany.mockResolvedValue([{ role: "user", content: privatePrompt }]);
    mocks.preferenceFindUnique.mockResolvedValue(null);
    mocks.providerFetch.mockReset();
    vi.stubGlobal("fetch", mocks.providerFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function sendMessage() {
    return nativeFetch(`${origin}/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: privatePrompt }),
    });
  }

  function streamResponse(chunks: unknown[]) {
    return new Response(
      `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`,
      { headers: { "Content-Type": "text/event-stream" } },
    );
  }

  it("streams the configured Groq model and records reported model metadata", async () => {
    mocks.providerFetch.mockResolvedValue(
      streamResponse([
        {
          model: "openai/gpt-oss-120b",
          choices: [{ delta: { content: "Hello from Groq." } }],
        },
      ]),
    );
    const infoLog = vi.spyOn(console, "info").mockImplementation(() => {});
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await sendMessage();
    const body = await response.text();
    const requestInit = mocks.providerFetch.mock.calls[0][1] as RequestInit;
    const requestBody = JSON.parse(requestInit.body as string) as { model: string };
    const assistantWrite = mocks.messageCreate.mock.calls[1][0] as {
      data: { model: string };
    };
    const providerLog = JSON.parse(infoLog.mock.calls[0][0] as string) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toContain("Hello from Groq.");
    expect(requestBody.model).toBe("openai/gpt-oss-120b");
    expect(assistantWrite.data.model).toBe("openai/gpt-oss-120b");
    expect(providerLog).toMatchObject({
      provider: "groq",
      configuredModel: "openai/gpt-oss-120b",
      reportedModel: "openai/gpt-oss-120b",
      httpStatus: 200,
    });
    expect(providerLog.durationMs).toEqual(expect.any(Number));
    expect(JSON.stringify([...infoLog.mock.calls, ...errorLog.mock.calls])).not.toContain(
      privatePrompt,
    );
    expect(JSON.stringify([...infoLog.mock.calls, ...errorLog.mock.calls])).not.toContain(
      mocks.env.AI_API_KEY,
    );
  });

  it.each([
    [401, 502, "AI_PROVIDER_AUTH_ERROR"],
    [404, 502, "AI_MODEL_NOT_FOUND"],
    [429, 503, "AI_PROVIDER_RATE_LIMITED"],
  ])(
    "handles provider HTTP %i without crashing the API",
    async (providerStatus, apiStatus, code) => {
      mocks.providerFetch.mockResolvedValue(
        new Response("provider error details", { status: providerStatus }),
      );
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

      const response = await sendMessage();
      const payload = (await response.json()) as {
        error: { code: string };
      };
      const providerLog = JSON.parse(errorLog.mock.calls[0][0] as string) as Record<
        string,
        unknown
      >;

      expect(response.status).toBe(apiStatus);
      expect(payload.error.code).toBe(code);
      expect(providerLog).toMatchObject({
        provider: "groq",
        configuredModel: "openai/gpt-oss-120b",
        reportedModel: null,
        httpStatus: providerStatus,
      });
      expect(providerLog.durationMs).toEqual(expect.any(Number));
    },
  );

  it("uses the configured model and logs null when response metadata omits the model", async () => {
    mocks.providerFetch.mockResolvedValue(
      streamResponse([{ choices: [{ delta: { content: "Metadata was unavailable." } }] }]),
    );
    const infoLog = vi.spyOn(console, "info").mockImplementation(() => {});

    const response = await sendMessage();
    await response.text();
    const assistantWrite = mocks.messageCreate.mock.calls[1][0] as {
      data: { model: string };
    };
    const providerLog = JSON.parse(infoLog.mock.calls[0][0] as string) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(assistantWrite.data.model).toBe("openai/gpt-oss-120b");
    expect(providerLog.reportedModel).toBeNull();
  });
});
