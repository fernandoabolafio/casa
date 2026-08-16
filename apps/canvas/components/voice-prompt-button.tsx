"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type VoicePromptButtonProps = {
  disabled?: boolean;
  openaiAvailable: boolean;
  onTranscript: (text: string) => void;
};

type VoiceState = "idle" | "recording" | "transcribing";

function pickRecorderMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

export function VoicePromptButton({
  disabled = false,
  openaiAvailable,
  onTranscript,
}: VoicePromptButtonProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      stopStream();
    };
  }, [stopStream]);

  const transcribeBlob = useCallback(
    async (blob: Blob, mimeType: string) => {
      setVoiceState("transcribing");
      setErrorMessage(null);

      try {
        const extension = extensionForMimeType(mimeType);
        const formData = new FormData();
        formData.append(
          "audio",
          new File([blob], `recording.${extension}`, { type: mimeType }),
        );

        const response = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });
        const payload: { text?: string; error?: string } = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "Transcription failed.");
        }

        if (!payload.text?.trim()) {
          throw new Error("No speech was detected.");
        }

        onTranscript(payload.text.trim());
      } catch (caught) {
        setErrorMessage(
          caught instanceof Error ? caught.message : "Transcription failed.",
        );
      } finally {
        setVoiceState("idle");
      }
    },
    [onTranscript],
  );

  const startRecording = useCallback(async () => {
    setErrorMessage(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickRecorderMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stopStream();

        const resolvedMimeType = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: resolvedMimeType });
        mediaRecorderRef.current = null;
        void transcribeBlob(blob, resolvedMimeType);
      };

      recorder.onerror = () => {
        stopStream();
        mediaRecorderRef.current = null;
        setVoiceState("idle");
        setErrorMessage("Recording failed. Try again.");
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setVoiceState("recording");
    } catch (caught) {
      stopStream();
      setVoiceState("idle");

      if (caught instanceof DOMException && caught.name === "NotAllowedError") {
        setErrorMessage("Microphone access was denied.");
        return;
      }

      setErrorMessage(
        caught instanceof Error ? caught.message : "Could not start recording.",
      );
    }
  }, [stopStream, transcribeBlob]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.stop();
  }, []);

  const handleClick = useCallback(() => {
    if (voiceState === "recording") {
      stopRecording();
      return;
    }

    if (voiceState === "idle") {
      void startRecording();
    }
  }, [startRecording, stopRecording, voiceState]);

  if (!openaiAvailable) {
    return (
      <div className="voice-prompt">
        <span className="voice-prompt__hint">
          Voice input requires an OpenAI API key.
        </span>
      </div>
    );
  }

  const isRecording = voiceState === "recording";
  const isTranscribing = voiceState === "transcribing";

  let label = "Record prompt";
  if (isRecording) label = "Stop recording";
  if (isTranscribing) label = "Transcribing…";

  return (
    <div className="voice-prompt">
      <button
        type="button"
        className={`tlui-button voice-prompt__button${
          isRecording ? " voice-prompt__button--recording" : ""
        }`}
        disabled={disabled || isTranscribing}
        aria-pressed={isRecording}
        title={
          isRecording
            ? "Stop and transcribe"
            : "Record a voice prompt (OpenAI Whisper)"
        }
        onClick={handleClick}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <span className="tlui-button__label">{label}</span>
      </button>
      {isRecording ? (
        <span className="voice-prompt__status">Listening… click to finish</span>
      ) : null}
      {errorMessage ? (
        <span className="voice-prompt__status voice-prompt__status--error">
          {errorMessage}
        </span>
      ) : null}
    </div>
  );
}
