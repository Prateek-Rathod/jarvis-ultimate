import { describe, expect, it } from "vitest";
import { limitConversationHistory } from "./context.js";

describe("limitConversationHistory", () => {
  it("keeps the newest complete messages within the character budget", () => {
    const history = [
      { role: "user" as const, content: "old".repeat(4) },
      { role: "assistant" as const, content: "older".repeat(4) },
      { role: "user" as const, content: "current question" },
      { role: "assistant" as const, content: "latest answer" },
    ];

    expect(limitConversationHistory(history, 30)).toEqual(history.slice(2));
  });

  it("retains a current message that fits and drops older history that would exceed the limit", () => {
    const history = [
      { role: "user" as const, content: "old context" },
      { role: "assistant" as const, content: "older answer" },
      { role: "user" as const, content: "x".repeat(20) },
    ];

    expect(limitConversationHistory(history, 20)).toEqual(history.slice(2));
  });

  it("does not include a newest message larger than the configured limit", () => {
    expect(limitConversationHistory([{ role: "user", content: "too long" }], 3)).toEqual([]);
  });
});
