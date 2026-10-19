import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  AI_API_KEY: "test-agent-intent-key",
  AI_BASE_URL: "https://api.groq.com/openai/v1",
  AI_MODEL: "openai/gpt-oss-120b",
}));

vi.mock("../../config/env.js", () => ({ env }));

import { interpretAgentInstruction } from "./intent.js";

describe("Agent Mode structured intent interpretation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns only validated plans for the fixed server-side tool registry", async () => {
    const providerFetch = vi.fn().mockResolvedValue(
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                kind: "execute",
                plan: {
                  tool: "open_website",
                  arguments: {
                    url: "https://www.youtube.com/results?search_query=Believer%20Imagine%20Dragons",
                    label: "YouTube search: Believer by Imagine Dragons",
                  },
                },
              }),
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", providerFetch);

    const decision = await interpretAgentInstruction("I'd like to listen to Believer");
    const request = JSON.parse(providerFetch.mock.calls[0]?.[1]?.body as string) as {
      model: string;
      response_format: { type: string };
    };

    expect(decision).toEqual({
      kind: "execute",
      plan: {
        tool: "open_website",
        arguments: {
          url: "https://www.youtube.com/results?search_query=Believer%20Imagine%20Dragons",
          label: "YouTube search: Believer by Imagine Dragons",
        },
      },
    });
    expect(request).toMatchObject({
      model: "openai/gpt-oss-120b",
      response_format: { type: "json_object" },
    });
    expect(providerFetch).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects arbitrary tools and unsafe navigation even when returned by the model", async () => {
    const providerFetch = vi.fn().mockResolvedValue(
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                kind: "execute",
                plan: {
                  tool: "run_shell",
                  arguments: { command: "whoami" },
                },
              }),
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", providerFetch);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(interpretAgentInstruction("run a command")).resolves.toBeNull();
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("agent_intent_invalid_decision"));
  });

  it.each([401, 404, 429])(
    "returns no plan on provider HTTP %i without leaking provider bodies or credentials",
    async (status) => {
      const providerFetch = vi
        .fn()
        .mockResolvedValue(new Response("private provider error body", { status }));
      vi.stubGlobal("fetch", providerFetch);
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(interpretAgentInstruction("play this")).resolves.toBeNull();
      expect(errorLog).toHaveBeenCalledWith(
        expect.stringContaining('"event":"agent_intent_provider_error"'),
      );
      expect(errorLog.mock.calls.flat().join(" ")).not.toContain("private provider error body");
      expect(errorLog.mock.calls.flat().join(" ")).not.toContain(env.AI_API_KEY);
    },
  );

  it("returns no plan when the provider omits structured intent metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: null } }] })),
    );
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(interpretAgentInstruction("play this")).resolves.toBeNull();
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("agent_intent_invalid_provider_response"),
    );
  });

  it("times out safely when the configured provider does not respond", async () => {
    vi.useFakeTimers();
    const providerFetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Request aborted", "AbortError")),
          );
        }),
    );
    vi.stubGlobal("fetch", providerFetch);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const decision = interpretAgentInstruction("play this");
    await vi.advanceTimersByTimeAsync(8_000);

    await expect(decision).resolves.toBeNull();
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("agent_intent_provider_unavailable"),
    );
  });

  it("asks for missing details and keeps unsupported actions non-executable", async () => {
    const response = (content: unknown) =>
      Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
    const providerFetch = vi
      .fn()
      .mockResolvedValueOnce(response({ kind: "needs_input", message: "Which song?" }))
      .mockResolvedValueOnce(response({ kind: "unsupported" }));
    vi.stubGlobal("fetch", providerFetch);

    await expect(interpretAgentInstruction("put on music")).resolves.toEqual({
      kind: "needs_input",
      message: "Which song?",
    });
    await expect(interpretAgentInstruction("send a WhatsApp message")).resolves.toEqual({
      kind: "unsupported",
      message: "Sorry, boss. I can’t do that just yet.",
    });
  });
});
