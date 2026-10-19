import { describe, expect, it } from "vitest";
import {
  classifyAgentUtterance,
  getTaskCreationFollowUp,
  getSearchContext,
  isYouTubePlaybackRequest,
  isSafeNavigationAddress,
  shouldAutoOpenYouTubePlayback,
  refineSearchInstruction,
  transitionAgentVoiceState,
} from "./agentVoice";

describe("Agent Mode voice intent classification", () => {
  it.each([
    ["Show me my pending tasks", { type: "list_tasks" }],
    ["Mark my React assignment as completed", { type: "complete_task", title: "React assignment" }],
    [
      "Could you please mark my React assignment as completed?",
      { type: "complete_task", title: "React assignment" },
    ],
    ["Delete task called old notes", { type: "delete_task", title: "old notes" }],
    ["Plan my day", { type: "plan_day" }],
    ["Remind me tomorrow to study", { type: "reminder" }],
    ["Open YouTube", { type: "agent_action" }],
    ["Take me to YouTube", { type: "agent_action" }],
    ["I’d like to listen to Believer", { type: "agent_action" }],
    ["Can you put on some music?", { type: "agent_action" }],
    ["Look for the best Python courses", { type: "agent_action" }],
    ["I need a task to revise DBMS", { type: "create_task", title: "revise DBMS" }],
    ["Delete task number three", { type: "delete_task", title: "", ordinal: 3 }],
    ["What can you help me with?", { type: "conversation" }],
  ] as const)("classifies %s", (utterance, expected) => {
    expect(classifyAgentUtterance(utterance)).toEqual(expected);
  });
});

describe("Agent Mode search follow-ups", () => {
  it.each([
    ["Play Kalyani", true],
    ["Play Kalyani in YouTube", true],
    ["I’d like to listen to Kalyani", true],
    ["Play a song on YouTube", false],
    ["Search YouTube for Kalyani", false],
  ])("detects explicit song playback requests: %s", (instruction, expected) => {
    expect(isYouTubePlaybackRequest(instruction)).toBe(expected);
  });

  it("auto-opens only explicit playback requests that resolve to YouTube results", () => {
    expect(
      shouldAutoOpenYouTubePlayback(
        "Play Kalyani on YouTube",
        "https://www.youtube.com/results?search_query=Kalyani",
      ),
    ).toBe(true);
    expect(
      shouldAutoOpenYouTubePlayback(
        "Search YouTube for Kalyani",
        "https://www.youtube.com/results?search_query=Kalyani",
      ),
    ).toBe(false);
    expect(
      shouldAutoOpenYouTubePlayback("Play Kalyani", "https://www.google.com/search?q=Kalyani"),
    ).toBe(false);
  });

  it("refines the last search without pretending to retrieve its results", () => {
    const context = getSearchContext(
      "https://www.youtube.com/results?search_query=React%20tutorials",
    );
    expect(context).toEqual({ kind: "youtube", query: "React tutorials" });
    expect(context && refineSearchInstruction(context, "Make it for beginners")).toBe(
      "Search YouTube for React tutorials for beginners",
    );
    expect(context && refineSearchInstruction(context, "Only beginner-friendly ones")).toBe(
      "Search YouTube for React tutorials beginner-friendly",
    );
  });

  describe("Agent Mode task follow-ups", () => {
    it("recognizes context-dependent requests to create a similar task", () => {
      expect(getTaskCreationFollowUp("Now make one for operating systems")).toBe(
        "operating systems",
      );
      expect(getTaskCreationFollowUp("What can you help me with?")).toBeNull();
    });

    it("classifies image-interface requests as verified search actions", () => {
      expect(classifyAgentUtterance("Show me futuristic AI interfaces")).toEqual({
        type: "agent_action",
      });
    });
  });

  it("does not classify unrelated URLs as a search context", () => {
    expect(getSearchContext("https://example.com/")).toBeNull();
  });
});

describe("Agent Mode voice state transitions", () => {
  it("allows the voice conversation flow and rejects conflicting operations", () => {
    expect(transitionAgentVoiceState("idle", "requesting_permission")).toBe(
      "requesting_permission",
    );
    expect(transitionAgentVoiceState("requesting_permission", "listening")).toBe("listening");
    expect(transitionAgentVoiceState("requesting_permission", "wake_listening")).toBe(
      "wake_listening",
    );
    expect(transitionAgentVoiceState("wake_listening", "activated")).toBe("activated");
    expect(transitionAgentVoiceState("activated", "processing")).toBe("processing");
    expect(transitionAgentVoiceState("speaking", "wake_listening")).toBe("wake_listening");
    expect(transitionAgentVoiceState("listening", "processing")).toBe("processing");
    expect(transitionAgentVoiceState("processing", "speaking")).toBe("speaking");
    expect(() => transitionAgentVoiceState("listening", "speaking")).toThrow(
      "Invalid Agent Mode voice transition",
    );
  });

  describe("Agent Mode browser navigation validation", () => {
    it("accepts public HTTP(S) destinations and rejects local or unsafe destinations", () => {
      expect(isSafeNavigationAddress("https://react.dev/")).toBe(true);
      expect(isSafeNavigationAddress("javascript:alert(1)")).toBe(false);
      expect(isSafeNavigationAddress("http://127.0.0.1:3000")).toBe(false);
      expect(isSafeNavigationAddress("http://[::1]:3000")).toBe(false);
      expect(isSafeNavigationAddress("http://printer.local")).toBe(false);
    });
  });
});
