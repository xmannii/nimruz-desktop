"use client";

import { useShenavaModel } from "@/hooks/use-shenava-model";
import {
  resamplePcm,
  SHENAVA_MODELS,
  SHENAVA_SAMPLE_RATE,
  type ShenavaModelKey,
} from "@/lib/speech/shenava";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const MAX_RECORDING_MS = 120_000;

type RecordingSession = {
  context: AudioContext;
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  output: GainNode;
  chunks: Float32Array[];
  sampleRate: number;
  timer: number;
  elapsedTimer: number;
};

function releaseSession(session: RecordingSession) {
  window.clearTimeout(session.timer);
  window.clearInterval(session.elapsedTimer);
  session.processor.onaudioprocess = null;
  session.processor.disconnect();
  session.source.disconnect();
  session.output.disconnect();
  for (const track of session.stream.getTracks()) track.stop();
  void session.context.close().catch(() => undefined);
}

function mergeChunks(chunks: Float32Array[]) {
  let length = 0;
  for (const chunk of chunks) length += chunk.length;
  const merged = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

type ShenavaSpeechInputOptions = {
  showTranscriptionSuccessToast?: boolean;
  enableSpaceShortcut?: boolean;
};

export function useShenavaSpeechInput(
  onTranscript: (transcript: string) => void,
  options: ShenavaSpeechInputOptions = {}
) {
  const showTranscriptionSuccessToast =
    options.showTranscriptionSuccessToast ?? true;
  const enableSpaceShortcut = options.enableSpaceShortcut ?? false;
  const model = useShenavaModel();
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const recordingRef = useRef<RecordingSession | null>(null);
  const startPendingRef = useRef(false);
  const transcriptCallbackRef = useRef(onTranscript);

  useEffect(() => {
    transcriptCallbackRef.current = onTranscript;
  }, [onTranscript]);

  const finishRecording = useCallback(async () => {
    const session = recordingRef.current;
    if (!session) return;
    recordingRef.current = null;
    setIsRecording(false);
    setRecordingSeconds(0);
    releaseSession(session);

    const captured = mergeChunks(session.chunks);
    if (captured.length < session.sampleRate / 5) {
      toast.info("صدای کافی ضبط نشد. دوباره تلاش کنید.");
      return;
    }

    setIsTranscribing(true);
    try {
      const samples = resamplePcm(
        captured,
        session.sampleRate,
        SHENAVA_SAMPLE_RATE
      );
      const result = await window.desktop.speech.shenava.transcribe(
        samples.slice().buffer as ArrayBuffer
      );
      if (!result.text) {
        toast.info("گفتار قابل‌تشخیصی شنیده نشد.");
        return;
      }
      transcriptCallbackRef.current(result.text);
      if (showTranscriptionSuccessToast) {
        toast.success("گفتار به متن تبدیل شد.");
      }
    } catch {
      toast.error("تبدیل گفتار به متن ناموفق بود.");
    } finally {
      setIsTranscribing(false);
    }
  }, [showTranscriptionSuccessToast]);

  const startRecording = useCallback(async () => {
    if (startPendingRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("میکروفن در این دستگاه در دسترس نیست.");
      return;
    }

    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    startPendingRef.current = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });
      context = new AudioContext();
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const output = context.createGain();
      output.gain.value = 0;
      const chunks: Float32Array[] = [];

      processor.onaudioprocess = (event) => {
        chunks.push(event.inputBuffer.getChannelData(0).slice());
      };
      source.connect(processor);
      processor.connect(output);
      output.connect(context.destination);

      const session: RecordingSession = {
        context,
        stream,
        source,
        processor,
        output,
        chunks,
        sampleRate: context.sampleRate,
        timer: window.setTimeout(() => {
          void finishRecording();
        }, MAX_RECORDING_MS),
        elapsedTimer: window.setInterval(() => {
          setRecordingSeconds((seconds) => seconds + 1);
        }, 1_000),
      };
      recordingRef.current = session;
      setRecordingSeconds(0);
      setIsRecording(true);
    } catch (error) {
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
      }
      if (context) void context.close().catch(() => undefined);
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        toast.error("دسترسی میکروفن رد شد. آن را در تنظیمات سیستم فعال کنید.");
      } else {
        toast.error("شروع ضبط صدا ناموفق بود.");
      }
    } finally {
      startPendingRef.current = false;
    }
  }, [finishRecording]);

  const cancelRecording = useCallback(() => {
    const session = recordingRef.current;
    if (!session) return;
    recordingRef.current = null;
    releaseSession(session);
    setRecordingSeconds(0);
    setIsRecording(false);
  }, []);

  useEffect(() => {
    if (!isRecording || enableSpaceShortcut) return;

    const handleRecordingShortcut = (event: globalThis.KeyboardEvent) => {
      if (
        event.code !== "Space" ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("button, input, textarea, select, [role='button']")
      ) {
        return;
      }

      event.preventDefault();
      void finishRecording();
    };

    window.addEventListener("keydown", handleRecordingShortcut);
    return () => window.removeEventListener("keydown", handleRecordingShortcut);
  }, [enableSpaceShortcut, finishRecording, isRecording]);

  const handleMicrophone = useCallback(async () => {
    if (isTranscribing) return;
    if (recordingRef.current) {
      await finishRecording();
      return;
    }

    let status = model.status;
    if (!status.models[status.activeModelKey].installed) {
      status = await model.refresh().catch(() => model.status);
    }

    if (status.models[status.activeModelKey].installed) {
      await startRecording();
    } else {
      setDownloadDialogOpen(true);
    }
  }, [finishRecording, isTranscribing, model, startRecording]);

  useEffect(() => {
    if (!enableSpaceShortcut) return;

    const handleSpaceShortcut = (event: globalThis.KeyboardEvent) => {
      if (
        event.code !== "Space" ||
        event.repeat ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest(
          "button, input, textarea, select, [contenteditable='true'], [role='button'], [role='combobox'], [role='option'], [data-space-shortcut-ignore]"
        )
      ) {
        return;
      }

      event.preventDefault();
      void handleMicrophone();
    };

    window.addEventListener("keydown", handleSpaceShortcut);
    return () => window.removeEventListener("keydown", handleSpaceShortcut);
  }, [enableSpaceShortcut, handleMicrophone]);

  const downloadModel = useCallback(async (modelKey: ShenavaModelKey) => {
    try {
      const status = await model.download(modelKey);
      if (!status.models[modelKey].installed) return;
      setDownloadDialogOpen(false);
      toast.success(
        `مدل ${SHENAVA_MODELS[modelKey].shortName} آماده و فعال شد؛ برای صحبت دوباره روی میکروفن بزنید.`
      );
    } catch {
      toast.error("دانلود مدل شنوا ناموفق بود.");
    }
  }, [model]);

  const cancelDownload = useCallback(async () => {
    await model.cancelDownload();
    setDownloadDialogOpen(false);
  }, [model]);

  useEffect(
    () => () => {
      const session = recordingRef.current;
      if (session) releaseSession(session);
      recordingRef.current = null;
    },
    []
  );

  return {
    status: model.status,
    isRecording,
    isTranscribing,
    recordingSeconds,
    downloadDialogOpen,
    setDownloadDialogOpen,
    handleMicrophone,
    cancelRecording,
    downloadModel,
    cancelDownload,
  };
}
