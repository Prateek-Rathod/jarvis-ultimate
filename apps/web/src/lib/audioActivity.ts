export interface AudioActivityRuntime {
  createContext: () => AudioContext;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (handle: number) => void;
}

const browserAudioRuntime: AudioActivityRuntime = {
  createContext: () => {
    if (!window.AudioContext) throw new Error("Web Audio is not supported in this browser.");
    return new window.AudioContext();
  },
  requestFrame: (callback) => window.requestAnimationFrame(callback),
  cancelFrame: (handle) => window.cancelAnimationFrame(handle),
};

export function calculateAudioLevel(samples: Uint8Array): number {
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (const sample of samples) {
    const normalized = (sample - 128) / 128;
    sumSquares += normalized * normalized;
  }
  return Math.min(1, Math.sqrt(sumSquares / samples.length) * 4);
}

export function monitorMicrophoneActivity(
  stream: MediaStream,
  onLevel: (level: number) => void,
  runtime: AudioActivityRuntime = browserAudioRuntime,
  onError?: (error: unknown) => void,
): () => void {
  const context = runtime.createContext();
  let source: MediaStreamAudioSourceNode | null = null;
  let frameHandle: number | null = null;
  let stopped = false;
  let stopResources = () => {};

  try {
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let lastReportedAt = 0;

    const sampleMicrophone = (timestamp: number) => {
      if (stopped) return;
      analyser.getByteTimeDomainData(samples);
      if (timestamp - lastReportedAt >= 66) {
        onLevel(calculateAudioLevel(samples));
        lastReportedAt = timestamp;
      }
      frameHandle = runtime.requestFrame(sampleMicrophone);
    };

    void context.resume().catch((error: unknown) => {
      if (stopped) return;
      reportAudioError(error, onError);
      stopResources();
    });
    frameHandle = runtime.requestFrame(sampleMicrophone);
  } catch (error) {
    source?.disconnect();
    closeAudioContext(context, onError);
    throw error;
  }

  stopResources = () => {
    if (stopped) return;
    stopped = true;
    if (frameHandle !== null) runtime.cancelFrame(frameHandle);
    source?.disconnect();
    onLevel(0);
    closeAudioContext(context, onError);
  };
  return stopResources;
}

function closeAudioContext(context: AudioContext, onError?: (error: unknown) => void): void {
  if (context.state === "closed") return;
  void context.close().catch((error: unknown) => reportAudioError(error, onError));
}

function reportAudioError(error: unknown, onError?: (error: unknown) => void): void {
  if (onError) onError(error);
  else console.error("Microphone audio activity failed.", error);
}
