import { describe, expect, it, vi } from "vitest";
import { VoiceTranscriptSession } from "./voiceTranscript";

describe("VoiceTranscriptSession", () => {
  it("submits completed final speech automatically and only once", () => {
    const submit = vi.fn();
    const session = new VoiceTranscriptSession("", submit);
    session.update([
      { transcript: "Plan a meeting", isFinal: true },
      { transcript: "for Friday", isFinal: true },
    ]);

    session.finish();
    session.finish();

    expect(submit).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledWith("Plan a meeting for Friday");
  });

  it("shows interim speech but does not submit it as final text", () => {
    const submit = vi.fn();
    const session = new VoiceTranscriptSession("Please", submit);
    expect(session.update([{ transcript: "schedule a call", isFinal: false }])).toBe(
      "Please schedule a call",
    );
    session.finish();
    expect(submit).not.toHaveBeenCalled();
  });

  it("submits final text collected before a manual stop", () => {
    const submit = vi.fn();
    const session = new VoiceTranscriptSession("", submit);
    session.update([{ transcript: "Send the summary", isFinal: true }]);
    session.finish();
    expect(submit).toHaveBeenCalledWith("Send the summary");
  });

  it("ignores empty transcripts and errors", () => {
    const submit = vi.fn();
    const emptySession = new VoiceTranscriptSession("", submit);
    emptySession.update([{ transcript: " ", isFinal: true }]);
    emptySession.finish();
    const failedSession = new VoiceTranscriptSession("", submit);
    failedSession.update([{ transcript: "Do not submit", isFinal: true }]);
    failedSession.fail();
    failedSession.finish();
    expect(submit).not.toHaveBeenCalled();
  });

  it("does not submit after cancellation during navigation", () => {
    const submit = vi.fn();
    const session = new VoiceTranscriptSession("", submit);
    session.update([{ transcript: "Discard this", isFinal: true }]);
    session.cancel();
    session.finish();
    expect(submit).not.toHaveBeenCalled();
  });

  it("preserves text already in the composer", () => {
    const submit = vi.fn();
    const session = new VoiceTranscriptSession("A draft", submit);
    session.update([{ transcript: "add the next step", isFinal: true }]);
    session.finish();
    expect(submit).toHaveBeenCalledWith("A draft add the next step");
  });
});
