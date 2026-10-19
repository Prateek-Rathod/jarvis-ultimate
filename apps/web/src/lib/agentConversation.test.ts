import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApiUrl, setCsrfToken } from "./api";
import { streamAgentConversation } from "./agentConversation";

afterEach(() => {
  vi.unstubAllGlobals();
  setCsrfToken(null);
});

describe("streamAgentConversation", () => {
  it("creates a conversation and streams an Agent Mode response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { id: "conversation-id" } }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          [
            'event: message\ndata: {"delta":"Hello "}\n\n',
            'event: message\ndata: {"delta":"there."}\n\n',
            'event: message\ndata: {"done":true}\n\n',
          ].join(""),
          { headers: { "Content-Type": "text/event-stream" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    setCsrfToken("voice-csrf");
    const deltas: string[] = [];

    await expect(
      streamAgentConversation({
        content: "What can you do?",
        conversationId: null,
        context: "Open tasks: finish the tests",
        signal: new AbortController().signal,
        onDelta: (value) => deltas.push(value),
      }),
    ).resolves.toEqual({ conversationId: "conversation-id", response: "Hello there." });

    expect(deltas).toEqual(["Hello ", "Hello there."]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [streamUrl, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(streamUrl).toBe(buildApiUrl("/api/v1/conversations/conversation-id/messages"));
    expect(new Headers(options.headers).get("X-CSRF-Token")).toBe("voice-csrf");
    expect(JSON.parse(options.body as string)).toEqual({
      content: "What can you do?",
      mode: "agent",
      context: "Open tasks: finish the tests",
    });
  });

  it("surfaces provider configuration failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { id: "conversation-id" } }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            error: { code: "AI_PROVIDER_NOT_CONFIGURED", message: "Configure the AI provider." },
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      streamAgentConversation({
        content: "Hello",
        conversationId: null,
        signal: new AbortController().signal,
        onDelta: () => {},
      }),
    ).rejects.toMatchObject({ status: 503, code: "AI_PROVIDER_NOT_CONFIGURED" });
  });
});
