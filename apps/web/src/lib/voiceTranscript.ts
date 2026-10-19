export interface TranscriptSegment {
  transcript: string;
  isFinal: boolean;
}

export class VoiceTranscriptSession {
  private finalTranscript = "";
  private interimTranscript = "";
  private finished = false;
  private failed = false;
  private cancelled = false;

  constructor(
    private readonly baseDraft: string,
    private readonly submit: (transcript: string) => void,
  ) {}

  update(segments: TranscriptSegment[]): string {
    this.finalTranscript = segments
      .filter((segment) => segment.isFinal)
      .map((segment) => segment.transcript.trim())
      .filter(Boolean)
      .join(" ");
    this.interimTranscript = segments
      .filter((segment) => !segment.isFinal)
      .map((segment) => segment.transcript.trim())
      .filter(Boolean)
      .join(" ");
    return [this.baseDraft, this.finalTranscript, this.interimTranscript].filter(Boolean).join(" ");
  }

  hasFinalTranscript(): boolean {
    return Boolean(this.finalTranscript.trim());
  }

  fail(): void {
    this.failed = true;
  }

  cancel(): void {
    this.cancelled = true;
  }

  finish(): void {
    if (this.finished || this.failed || this.cancelled) return;
    this.finished = true;
    const transcript = this.finalTranscript.trim();
    if (!transcript) return;
    this.submit([this.baseDraft, transcript].filter(Boolean).join(" "));
  }
}
