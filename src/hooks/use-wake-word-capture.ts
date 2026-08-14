"use client";

import { useSpeech } from "@/components/speech/speech-provider";
import { openMicrophoneStream } from "@/lib/speech/microphone";
import type { WakeWordStatus } from "@/lib/speech/wake-word";
import { useEffect, useRef, useState } from "react";

type CaptureSession = {
  context: AudioContext;
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  processor: AudioWorkletNode;
  output: GainNode;
};

function stopCaptureSession(session: CaptureSession) {
  session.processor.port.onmessage = null;
  session.processor.disconnect();
  session.source.disconnect();
  session.output.disconnect();
  for (const track of session.stream.getTracks()) track.stop();
  void session.context.close().catch(() => undefined);
}

function describeCaptureError(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "دسترسی میکروفن برای شنیدن «هی نیمروز» داده نشده است.";
  }
  if (
    error instanceof DOMException &&
    (error.name === "NotFoundError" || error.name === "OverconstrainedError")
  ) {
    return "میکروفن انتخاب‌شده برای شنیدن «هی نیمروز» در دسترس نیست.";
  }
  return error instanceof Error
    ? error.message
    : "شروع شنیدن «هی نیمروز» ناموفق بود.";
}

export function useWakeWordCapture() {
  const { selectedMicrophoneId } = useSpeech();
  const [status, setStatus] = useState<WakeWordStatus | null>(null);
  const sessionRef = useRef<CaptureSession | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    let active = true;
    void window.desktop.speech.wakeWord.getStatus().then((next) => {
      if (active) setStatus(next);
    });
    const unsubscribe = window.desktop.speech.wakeWord.onStatusChange((next) => {
      if (active) setStatus(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const generation = ++generationRef.current;
    const previousSession = sessionRef.current;
    sessionRef.current = null;
    if (previousSession) stopCaptureSession(previousSession);

    if (!status?.captureRequested) return;

    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;

    void (async () => {
      try {
        stream = await openMicrophoneStream(selectedMicrophoneId);
        if (generationRef.current !== generation) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }

        context = new AudioContext({ sampleRate: 16_000 });
        await context.audioWorklet.addModule("/wake-word-audio-worklet.js");
        await context.resume();
        if (context.sampleRate !== 16_000) {
          throw new Error("Wake-word audio could not be resampled to 16 kHz.");
        }

        const source = context.createMediaStreamSource(stream);
        const processor = new AudioWorkletNode(
          context,
          "nimruz-wake-word-processor",
          { channelCount: 1, numberOfInputs: 1, numberOfOutputs: 1 }
        );
        const output = context.createGain();
        output.gain.value = 0;
        processor.port.onmessage = (event: MessageEvent<unknown>) => {
          if (!(event.data instanceof ArrayBuffer)) return;
          void window.desktop.speech.wakeWord
            .processAudio(event.data)
            .catch(() => undefined);
        };
        source.connect(processor);
        processor.connect(output);
        output.connect(context.destination);

        if (generationRef.current !== generation) {
          stopCaptureSession({ context, stream, source, processor, output });
          return;
        }
        sessionRef.current = { context, stream, source, processor, output };
      } catch (error) {
        if (stream) {
          for (const track of stream.getTracks()) track.stop();
        }
        if (context) void context.close().catch(() => undefined);
        if (generationRef.current === generation) {
          void window.desktop.speech.wakeWord.reportCaptureError(
            describeCaptureError(error)
          );
        }
      }
    })();

    return () => {
      generationRef.current += 1;
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) stopCaptureSession(session);
      if (stream && !session) {
        for (const track of stream.getTracks()) track.stop();
      }
      if (context && !session) void context.close().catch(() => undefined);
    };
  }, [selectedMicrophoneId, status?.captureRequested]);

  return status;
}
