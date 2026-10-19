import { ApiError, apiRequest, buildApiUrl, getCsrfToken } from "./api";

interface Conversation {
  id: string;
}

interface StreamOptions {
  content: string;
  conversationId: string | null;
  context?: string;
  signal: AbortSignal;
  onDelta: (text: string) => void;
}

export async function streamAgentConversation({
  content,
  conversationId,
  context,
  signal,
  onDelta,
}: StreamOptions): Promise<{ conversationId: string; response: string }> {
  const activeConversationId =
    conversationId ??
    (
      await apiRequest<Conversation>("/api/v1/conversations", {
        method: "POST",
        body: JSON.stringify({}),
        signal,
      })
    ).id;
  const providerResponse = await fetch(
    buildApiUrl(`/api/v1/conversations/${activeConversationId}/messages`),
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": getCsrfToken() ?? "",
      },
      body: JSON.stringify({
        content,
        mode: "agent",
        ...(context ? { context } : {}),
      }),
      signal,
    },
  );

  if (!providerResponse.ok) {
    const payload = (await providerResponse.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      payload?.error?.message ?? `The request failed (${providerResponse.status}).`,
      providerResponse.status,
      payload?.error?.code ?? "REQUEST_FAILED",
    );
  }
  if (!providerResponse.body) throw new Error("The AI service did not provide a response stream.");

  const reader = providerResponse.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let response = "";
  let streamCompleted = false;

  const processBlock = (block: string) => {
    let eventName = "message";
    const dataLines: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) return;
    const payload = JSON.parse(dataLines.join("\n")) as {
      delta?: string;
      message?: string;
      done?: boolean;
    };
    if (eventName === "error") throw new Error(payload.message ?? "The response stream failed.");
    if (payload.done) {
      streamCompleted = true;
      return;
    }
    if (payload.delta) {
      response += payload.delta;
      onDelta(response);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const blocks = pending.split(/\r?\n\r?\n/);
      pending = blocks.pop() ?? "";
      for (const block of blocks) processBlock(block);
    }
    pending += decoder.decode();
    if (pending.trim()) processBlock(pending);
  } finally {
    reader.releaseLock();
  }

  if (!streamCompleted) throw new Error("The response ended before it completed. Please retry.");
  return { conversationId: activeConversationId, response };
}
