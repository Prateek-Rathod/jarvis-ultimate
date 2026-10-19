export type WakePhraseMatch = { type: "none" } | { type: "wake"; command: string | null };

const wakePhrasePattern = /^(?:hey|hi|okay|ok)\s+jarvis\b[\s,.:;!?-]*(.*)$/i;

export function detectWakePhrase(transcript: string): WakePhraseMatch {
  const match = wakePhrasePattern.exec(transcript.trim());
  if (!match) return { type: "none" };
  const command = match[1]?.trim();
  return { type: "wake", command: command || null };
}

export type WakeCommandResolution =
  { type: "ignore" } | { type: "await_command" } | { type: "command"; text: string };

export function resolveWakeCommand(
  finalizedTranscripts: readonly string[],
  awaitingCommand: boolean,
): WakeCommandResolution {
  if (finalizedTranscripts.length === 0) return { type: "ignore" };
  if (awaitingCommand) {
    const firstTranscript = finalizedTranscripts[0] ?? "";
    const wakeMatch = detectWakePhrase(firstTranscript);
    const commandParts =
      wakeMatch.type === "wake"
        ? [wakeMatch.command, ...finalizedTranscripts.slice(1)]
        : [...finalizedTranscripts];
    const command = commandParts.filter((part): part is string => Boolean(part?.trim())).join(" ");
    return command ? { type: "command", text: command } : { type: "await_command" };
  }

  const wakeIndex = finalizedTranscripts.findIndex(
    (transcript) => detectWakePhrase(transcript).type === "wake",
  );
  if (wakeIndex < 0) return { type: "ignore" };
  const wakeMatch = detectWakePhrase(finalizedTranscripts[wakeIndex] ?? "");
  if (wakeMatch.type === "none") return { type: "ignore" };
  const commandParts = [wakeMatch.command, ...finalizedTranscripts.slice(wakeIndex + 1)];
  const command = commandParts.filter((part): part is string => Boolean(part?.trim())).join(" ");
  return command ? { type: "command", text: command } : { type: "await_command" };
}

export interface FinalTranscriptSegment {
  transcript: string;
  isFinal: boolean;
}

export function getFinalTranscripts(segments: readonly FinalTranscriptSegment[]): string[] {
  return segments
    .filter((segment) => segment.isFinal)
    .map((segment) => segment.transcript.trim())
    .filter(Boolean);
}

export class FinalTranscriptDeduplicator {
  private readonly recentlyProcessed = new Map<string, number>();

  constructor(
    private readonly duplicateWindowMs = 5_000,
    private readonly maxEntries = 32,
  ) {}

  shouldProcess(transcript: string, now = Date.now()): boolean {
    const normalized = transcript
      .trim()
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) return false;
    for (const [value, timestamp] of this.recentlyProcessed) {
      if (now - timestamp > this.duplicateWindowMs) this.recentlyProcessed.delete(value);
    }
    const previousTimestamp = this.recentlyProcessed.get(normalized);
    if (previousTimestamp !== undefined && now - previousTimestamp <= this.duplicateWindowMs) {
      return false;
    }
    this.recentlyProcessed.set(normalized, now);
    while (this.recentlyProcessed.size > this.maxEntries) {
      const oldest = this.recentlyProcessed.keys().next().value;
      if (oldest === undefined) break;
      this.recentlyProcessed.delete(oldest);
    }
    return true;
  }

  clear(): void {
    this.recentlyProcessed.clear();
  }
}
