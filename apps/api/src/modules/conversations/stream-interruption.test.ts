import type { NextFunction, Request, Response as ExpressResponse } from "express";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    AI_API_KEY: "test-provider-key",
    AI_BASE_URL: "https://api.groq.com/openai/v1",
    AI_MODEL: "test-model",
  },
  conversationFindFirst: vi.fn(),
  conversationUpdate: vi.fn(),
  messageCreate: vi.fn(),
  messageFindMany: vi.fn(),
  preferenceFindUnique: vi.fn(),
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
  authenticate: (request: Request, _response: ExpressResponse, next: NextFunction) => {
    request.auth = {
      user: {
        id: "test-user",
        email: "user@example.test",
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
const conversationId = "0236facc-eccc-4c5f-8c23-c6ff2537f54e";
const app = express();
app.use(express.json());
app.use(conversationRouter);
app.use((error: unknown, _request: Request, response: ExpressResponse, next: NextFunction) => {
  void next;
  response.status(500).json({ error: error instanceof Error ? error.message : "unknown" });
});

describe("interrupted provider streams", () => {
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
    mocks.messageCreate
      .mockReset()
      .mockResolvedValueOnce({ id: "user-message" })
      .mockResolvedValueOnce({ id: "partial-assistant-message" });
    mocks.messageFindMany.mockResolvedValue([{ role: "user", content: "test prompt" }]);
    mocks.preferenceFindUnique.mockResolvedValue(null);
    let chunkSent = false;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              if (chunkSent) {
                controller.error(new Error("stream connection ended unexpectedly"));
                return;
              }
              chunkSent = true;
              controller.enqueue(
                new TextEncoder().encode(
                  `data: ${JSON.stringify({
                    choices: [{ delta: { content: "Partial response" } }],
                  })}\n\n`,
                ),
              );
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        ),
      ),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("persists partial content as interrupted and sends an error instead of completion", async () => {
    const response = await nativeFetch(`${origin}/${conversationId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": "test-csrf",
      },
      body: JSON.stringify({ content: "test prompt" }),
    });
    const stream = await response.text();
    expect(response.status).toBe(200);
    const savedMessage = mocks.messageCreate.mock.calls[1][0] as {
      data: { content: string; status: string };
    };

    expect(stream).toContain('"delta":"Partial response"');
    expect(stream).toContain("event: error");
    expect(stream).not.toContain('"done":true');
    expect(savedMessage.data).toMatchObject({
      content: "Partial response",
      status: "interrupted",
    });
  });
});
