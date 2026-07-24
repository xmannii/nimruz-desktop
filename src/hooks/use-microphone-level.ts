"use client";

import { useSpeech } from "@/components/speech/speech-provider";
import {
  DEFAULT_MICROPHONE_ID,
  openMicrophoneStream,
} from "@/lib/speech/microphone";
import { useCallback, useEffect, useRef, useState } from "react";

type PreviewSession = {
  context: AudioContext;
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  animationFrame: number;
};

function releasePreview(session: PreviewSession) {
  window.cancelAnimationFrame(session.animationFrame);
  session.source.disconnect();
  session.analyser.disconnect();
  for (const track of session.stream.getTracks()) track.stop();
  void session.context.close().catch(() => undefined);
}

export function useMicrophoneLevel() {
  const {
    selectedMicrophoneId,
    setSelectedMicrophoneId,
    refreshMicrophones,
  } = useSpeech();
  const [level, setLevel] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<PreviewSession | null>(null);

  const stop = useCallback(() => {
    const session = sessionRef.current;
    if (session) releasePreview(session);
    sessionRef.current = null;
    setIsActive(false);
    setLevel(0);
    setError(null);
  }, []);

  const start = useCallback(async () => {
    stop();
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("میکروفن در این دستگاه در دسترس نیست.");
      return;
    }

    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    try {
      stream = await openMicrophoneStream(selectedMicrophoneId);
      context = new AudioContext();
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const session: PreviewSession = {
        context,
        stream,
        source,
        analyser,
        animationFrame: 0,
      };
      sessionRef.current = session;
      setError(null);
      setIsActive(true);

      let lastUpdate = 0;
      const measure = (timestamp: number) => {
        if (sessionRef.current !== session) return;
        if (timestamp - lastUpdate >= 50) {
          analyser.getByteTimeDomainData(samples);
          let sumSquares = 0;
          for (const sample of samples) {
            const normalized = (sample - 128) / 128;
            sumSquares += normalized * normalized;
          }
          const rms = Math.sqrt(sumSquares / samples.length);
          setLevel(Math.min(100, Math.round(rms * 360)));
          lastUpdate = timestamp;
        }
        session.animationFrame = window.requestAnimationFrame(measure);
      };
      session.animationFrame = window.requestAnimationFrame(measure);
      void refreshMicrophones().catch(() => undefined);
    } catch (cause) {
      for (const track of stream?.getTracks() ?? []) track.stop();
      if (context) void context.close().catch(() => undefined);
      if (cause instanceof DOMException && cause.name === "NotAllowedError") {
        setError("دسترسی میکروفن رد شد. آن را در تنظیمات سیستم فعال کنید.");
      } else if (
        cause instanceof DOMException &&
        (cause.name === "NotFoundError" ||
          cause.name === "OverconstrainedError")
      ) {
        setSelectedMicrophoneId(DEFAULT_MICROPHONE_ID);
        setError("میکروفن انتخاب‌شده دیگر در دسترس نیست.");
      } else {
        setError("آزمایش میکروفن ناموفق بود.");
      }
    }
  }, [
    refreshMicrophones,
    selectedMicrophoneId,
    setSelectedMicrophoneId,
    stop,
  ]);

  useEffect(() => stop, [stop]);

  return { level, isActive, error, start, stop };
}
