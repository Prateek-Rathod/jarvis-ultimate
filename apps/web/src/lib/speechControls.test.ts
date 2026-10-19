import { describe, expect, it, vi } from "vitest";
import {
  applySpeechOptions,
  cancelSpeech,
  resolveSpeechOptions,
  shouldSpeakResponse,
} from "./speechControls";

function voice(name: string, lang: string, isDefault = false): SpeechSynthesisVoice {
  return {
    name,
    lang,
    default: isDefault,
    localService: true,
    voiceURI: name,
  };
}

describe("speech controls", () => {
  it("uses the selected voice, rate, and pitch", () => {
    const selected = voice("Selected voice", "en-GB");
    const options = resolveSpeechOptions(
      { speechVoice: selected.name, speechRate: 1.25, speechPitch: 0.9 },
      [voice("Other voice", "en-US"), selected],
      "en-US",
    );
    const utterance = { voice: null as SpeechSynthesisVoice | null, rate: 1, pitch: 1 };
    applySpeechOptions(utterance, options);

    expect(utterance).toEqual({ voice: selected, rate: 1.25, pitch: 0.9 });
  });

  it("falls back to a matching locale when the stored voice is unavailable", () => {
    const fallback = voice("British English", "en-GB");
    expect(
      resolveSpeechOptions(
        { speechVoice: "No longer installed", speechRate: 1, speechPitch: 1 },
        [fallback, voice("French", "fr-FR")],
        "en-US",
      ).voice,
    ).toBe(fallback);
  });

  it("does not auto-speak when disabled, outside voice mode, or without a response", () => {
    expect(shouldSpeakResponse(false, true, "answer")).toBe(false);
    expect(shouldSpeakResponse(true, false, "answer")).toBe(false);
    expect(shouldSpeakResponse(true, true, "  ")).toBe(false);
    expect(shouldSpeakResponse(true, true, "answer")).toBe(true);
  });

  it("cancels any active speech when asked", () => {
    const cancel = vi.fn();
    cancelSpeech({ cancel });
    cancelSpeech(undefined);
    expect(cancel).toHaveBeenCalledOnce();
  });
});
