import { describe, expect, it } from "vitest";
import { markdownToSpeech } from "./markdownToSpeech";

describe("markdownToSpeech", () => {
  it("converts headings, emphasis, and inline code to natural speech", () => {
    expect(
      markdownToSpeech("## Today's Plan\n\n**Your task is complete.** Run `npm run build`."),
    ).toBe("Today's Plan. Your task is complete. Run npm run build.");
  });

  it("speaks link text and image alt text without their URLs", () => {
    expect(
      markdownToSpeech(
        "[Open the dashboard](https://example.com) ![workspace](https://image.test/a.png)",
      ),
    ).toBe("Open the dashboard workspace.");
  });

  it("converts ordered lists into spoken ordinal steps", () => {
    expect(markdownToSpeech("1. Open Settings\n2. Enable voice")).toBe(
      "First, open Settings. Second, enable voice.",
    );
  });

  it("keeps unordered list content and strips blockquote markers", () => {
    expect(markdownToSpeech("- First item\n- **Second item**\n\n> One quoted thought")).toBe(
      "First item. Second item. One quoted thought.",
    );
  });

  it("replaces fenced code with a concise explanation", () => {
    expect(markdownToSpeech("Example:\n\n```ts\nconst answer = 42;\n```")).toBe(
      "Example. A code example is shown in the chat.",
    );
  });

  it("reads table content with useful header labels", () => {
    expect(markdownToSpeech("| Time | Task |\n| --- | --- |\n| 8:00 | Plan |")).toBe(
      "Time: 8:00. Task: Plan.",
    );
  });

  it("removes escaped formatting characters and excessive whitespace", () => {
    expect(markdownToSpeech("Use \\*literal stars\\*.\n\n\nThen continue.")).toBe(
      "Use *literal stars*. Then continue.",
    );
  });

  it("returns an empty string for empty or formatting-only content", () => {
    expect(markdownToSpeech("  \n---\n")).toBe("");
  });
});
