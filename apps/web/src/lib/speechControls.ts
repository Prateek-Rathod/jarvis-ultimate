import type { UserPreferences } from "../types";

type SpeechPreferenceValues = Pick<UserPreferences, "speechVoice" | "speechRate" | "speechPitch">;

export function resolveSpeechOptions(
  preferences: SpeechPreferenceValues,
  voices: SpeechSynthesisVoice[],
  language: string,
): { voice: SpeechSynthesisVoice | null; rate: number; pitch: number } {
  const normalizedLanguage = language.toLowerCase();
  const voice =
    voices.find((available) => available.name === preferences.speechVoice) ??
    voices.find((available) => available.lang.toLowerCase() === normalizedLanguage) ??
    voices.find((available) =>
      available.lang.toLowerCase().startsWith(normalizedLanguage.split("-")[0]),
    ) ??
    voices.find((available) => available.default) ??
    null;
  return { voice, rate: preferences.speechRate, pitch: preferences.speechPitch };
}

export function applySpeechOptions(
  utterance: Pick<SpeechSynthesisUtterance, "voice" | "rate" | "pitch">,
  options: ReturnType<typeof resolveSpeechOptions>,
): void {
  utterance.voice = options.voice;
  utterance.rate = options.rate;
  utterance.pitch = options.pitch;
}

export function shouldSpeakResponse(
  enabled: boolean,
  voiceMode: boolean,
  response: string,
): boolean {
  return enabled && voiceMode && Boolean(response.trim());
}

export function cancelSpeech(synthesis: Pick<SpeechSynthesis, "cancel"> | undefined): void {
  synthesis?.cancel();
}
