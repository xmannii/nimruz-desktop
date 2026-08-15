"use client";

import { useShenavaModel } from "@/hooks/use-shenava-model";
import { useSpeech } from "@/components/speech/speech-provider";
import {
  DEFAULT_MICROPHONE_ID,
  openMicrophoneStream,
} from "@/lib/speech/microphone";
import { showMicrophonePermissionDeniedToast } from "@/lib/speech/microphone-permission";
import {
  resamplePcm,
  SHENAVA_MODELS,
  SHENAVA_SAMPLE_RATE,
  type ShenavaModelKey,
} from "@/lib/speech/shenava";
import {
  advanceSilenceEndpoint,
  createSilenceEndpointState,
  pcmRms,
  type SilenceEndpointState,
} from "@/lib/speech/silence-endpoint";
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
  autoSend: boolean;
  endpoint: SilenceEndpointState;
  ending: boolean;
};

export type SpeechTranscriptMeta = {
  shouldSend: boolean;
};

export type StartSpeechInputOptions = {
  autoSend?: boolean;
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
  onTranscript: (transcript: string, meta: SpeechTranscriptMeta) => void,
  options: ShenavaSpeechInputOptions = {}
) {
  const showTranscriptionSuccessToast =
    options.showTranscriptionSuccessToast ?? true;
  const enableSpaceShortcut = options.enableSpaceShortcut ?? false;
  const model = useShenavaModel();
  const {
    selectedMicrophoneId,
    setSelectedMicrophoneId,
    refreshMicrophones,
  } = useSpeech();
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

    try {
      const captured = mergeChunks(session.chunks);
      if (captured.length < session.sampleRate / 5) {
        toast.info("صدای کافی ضبط نشد. دوباره تلاش کنید.");
        return;
      }

      setIsTranscribing(true);
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
      transcriptCallbackRef.current(result.text, {
        shouldSend: session.autoSend,
      });
      if (showTranscriptionSuccessToast && !session.autoSend) {
        toast.success("گفتار به متن تبدیل شد.");
      }
    } catch {
      toast.error("تبدیل گفتار به متن ناموفق بود.");
    } finally {
      setIsTranscribing(false);
      void window.desktop.speech.wakeWord.resumeAfterSpeech();
    }
  }, [showTranscriptionSuccessToast]);

  const cancelRecording = useCallback(() => {
    const session = recordingRef.current;
    if (!session) return;
    recordingRef.current = null;
    releaseSession(session);
    setRecordingSeconds(0);
    setIsRecording(false);
    void window.desktop.speech.wakeWord.resumeAfterSpeech();
  }, []);

  const startRecording = useCallback(async (autoSend = false) => {
    if (startPendingRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("میکروفن در این دستگاه در دسترس نیست.");
      return;
    }

    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    startPendingRef.current = true;
    try {
      await window.desktop.speech.wakeWord.pauseForSpeech();
      stream = await openMicrophoneStream(selectedMicrophoneId);
      void refreshMicrophones().catch(() => undefined);
      context = new AudioContext();
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const output = context.createGain();
      output.gain.value = 0;
      const session: RecordingSession = {
        context,
        stream,
        source,
        processor,
        output,
        chunks: [],
        sampleRate: context.sampleRate,
        timer: 0,
        elapsedTimer: 0,
        autoSend,
        endpoint: createSilenceEndpointState(),
        ending: false,
      };

      processor.onaudioprocess = (event) => {
        const frame = event.inputBuffer.getChannelData(0).slice();
        session.chunks.push(frame);
        if (recordingRef.current !== session || session.ending) return;
        const decision = advanceSilenceEndpoint(
          session.endpoint,
          pcmRms(frame),
          (frame.length / session.sampleRate) * 1_000
        );
        if (decision === "end") {
          session.ending = true;
          window.setTimeout(() => {
            if (recordingRef.current !== session) return;
            void finishRecording();
          }, 0);
          return;
        }
        if (decision === "timeout") {
          session.ending = true;
          window.setTimeout(() => {
            if (recordingRef.current !== session) return;
            cancelRecording();
            toast.info("صدایی شنیده نشد.");
          }, 0);
        }
      };
      source.connect(processor);
      processor.connect(output);
      output.connect(context.destination);

      session.timer = window.setTimeout(() => {
        void finishRecording();
      }, MAX_RECORDING_MS);
      session.elapsedTimer = window.setInterval(() => {
        setRecordingSeconds((seconds) => seconds + 1);
      }, 1_000);
      recordingRef.current = session;
      setRecordingSeconds(0);
      setIsRecording(true);
    } catch (error) {
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
      }
      if (context) void context.close().catch(() => undefined);
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        showMicrophonePermissionDeniedToast();
      } else if (
        error instanceof DOMException &&
        (error.name === "NotFoundError" ||
          error.name === "OverconstrainedError")
      ) {
        setSelectedMicrophoneId(DEFAULT_MICROPHONE_ID);
        toast.error("میکروفن انتخاب‌شده در دسترس نیست؛ میکروفن سیستم فعال شد.");
      } else {
        toast.error("شروع ضبط صدا ناموفق بود.");
      }
      void window.desktop.speech.wakeWord.resumeAfterSpeech();
    } finally {
      startPendingRef.current = false;
    }
  }, [
    cancelRecording,
    finishRecording,
    refreshMicrophones,
    selectedMicrophoneId,
    setSelectedMicrophoneId,
  ]);

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

  const handleMicrophone = useCallback(async (
    startOptions: StartSpeechInputOptions = {}
  ) => {
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
      await startRecording(startOptions.autoSend === true);
    } else {
      setDownloadDialogOpen(true);
      void window.desktop.speech.wakeWord.resumeAfterSpeech();
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
      if (session) {
        releaseSession(session);
        void window.desktop.speech.wakeWord.resumeAfterSpeech();
      }
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
