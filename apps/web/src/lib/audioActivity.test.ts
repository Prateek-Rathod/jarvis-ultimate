import { describe, expect, it, vi } from "vitest";
import { calculateAudioLevel, monitorMicrophoneActivity } from "./audioActivity";

describe("calculateAudioLevel", () => {
  it("returns zero for silence and empty samples", () => {
    expect(calculateAudioLevel(new Uint8Array())).toBe(0);
    expect(calculateAudioLevel(new Uint8Array([128, 128, 128]))).toBe(0);
  });

  it("scales real waveform amplitude into a bounded visual level", () => {
    expect(calculateAudioLevel(new Uint8Array([0, 255, 0, 255]))).toBe(1);
    expect(calculateAudioLevel(new Uint8Array([127, 129, 127, 129]))).toBeLessThan(0.1);
  });
});

describe("monitorMicrophoneActivity", () => {
  it("samples the microphone waveform and releases the audio resources", async () => {
    const frameCallbacks = new Map<number, FrameRequestCallback>();
    const analyser = {
      fftSize: 4,
      getByteTimeDomainData: vi.fn((samples: Uint8Array) => samples.set([0, 255, 0, 255])),
    };
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const context = {
      state: "running",
      createAnalyser: vi.fn(() => analyser),
      createMediaStreamSource: vi.fn(() => source),
      resume: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    let nextFrameId = 1;
    const runtime = {
      createContext: () => context as unknown as AudioContext,
      requestFrame: vi.fn((callback: FrameRequestCallback) => {
        const handle = nextFrameId++;
        frameCallbacks.set(handle, callback);
        return handle;
      }),
      cancelFrame: vi.fn((handle: number) => frameCallbacks.delete(handle)),
    };
    const onLevel = vi.fn();
    const stop = await monitorMicrophoneActivity({} as MediaStream, onLevel, runtime);
    const [frameHandle, callback] = [...frameCallbacks.entries()][0] ?? [];

    expect(frameHandle).toBeDefined();
    callback?.(100);
    expect(onLevel).toHaveBeenCalledWith(1);

    stop();
    stop();

    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(runtime.cancelFrame).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    expect(onLevel).toHaveBeenLastCalledWith(0);
  });
});
