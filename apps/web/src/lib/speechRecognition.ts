export interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}

export interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResult>;
}

export interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}

export interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

export function getSpeechRecognitionConstructor(): (new () => SpeechRecognitionLike) | undefined {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}
