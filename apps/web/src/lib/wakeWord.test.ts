import { describe, expect, it } from "vitest";
import {
  detectWakePhrase,
  FinalTranscriptDeduplicator,
  getFinalTranscripts,
  resolveWakeCommand,
} from "./wakeWord";

describe("wake phrase parsing", () => {
  it.each(["Hey JARVIS", "Hi Jarvis", "Okay JARVIS", "OK Jarvis"])(
    "recognizes the wake phrase %s",
    (phrase) => {
      expect(detectWakePhrase(phrase)).toEqual({ type: "wake", command: null });
    },
  );

  it("extracts a command spoken in the same utterance as the wake phrase", () => {
    expect(detectWakePhrase("Hey JARVIS, play Believer by Imagine Dragons")).toEqual({
      type: "wake",
      command: "play Believer by Imagine Dragons",
    });
  });

  it("does not activate when the wake phrase is not at the start of a transcript", () => {
    expect(detectWakePhrase("I told Hey JARVIS to open YouTube")).toEqual({ type: "none" });
  });

  it("joins a wake phrase and command split across final recognition segments", () => {
    expect(resolveWakeCommand(["Hey JARVIS", "play Believer"], false)).toEqual({
      type: "command",
      text: "play Believer",
    });
  });

  it("waits for the command when only the wake phrase has been spoken", () => {
    expect(resolveWakeCommand(["Okay JARVIS"], false)).toEqual({ type: "await_command" });
    expect(resolveWakeCommand(["How are you?"], true)).toEqual({
      type: "command",
      text: "How are you?",
    });
  });
});

describe("final speech transcripts", () => {
  it("ignores partial results and returns only finalized, non-empty speech", () => {
    expect(
      getFinalTranscripts([
        { transcript: "Hey JARVIS, play", isFinal: false },
        { transcript: "Hey JARVIS, play Believer", isFinal: true },
        { transcript: "  ", isFinal: true },
      ]),
    ).toEqual(["Hey JARVIS, play Believer"]);
  });

  it("suppresses duplicate final recognition events within the retry window", () => {
    const deduplicator = new FinalTranscriptDeduplicator(1_000);
    expect(deduplicator.shouldProcess("Create a task", 10_000)).toBe(true);
    expect(deduplicator.shouldProcess(" create a task. ", 10_500)).toBe(false);
    expect(deduplicator.shouldProcess("Create a task", 11_001)).toBe(true);
  });
});
