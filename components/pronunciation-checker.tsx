"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { REVIEW_GRADE_LABELS } from "@/lib/constants";
import type { Card, PronunciationAssessment } from "@/lib/types";

type PronunciationCheckerProps = {
  card: Pick<Card, "hanzi" | "pinyin" | "translation">;
  onAssessmentChange?: (assessment: PronunciationAssessment | null) => void;
  compact?: boolean;
};

const MIME_TYPE_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
];

function getSupportedMimeType() {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return "";
  }

  for (const candidate of MIME_TYPE_CANDIDATES) {
    if (typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return "";
}

function formatSeconds(milliseconds: number) {
  return `${Math.max(0, Math.round(milliseconds / 1000))}с`;
}

export function PronunciationChecker({ card, onAssessmentChange, compact = false }: PronunciationCheckerProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isAssessing, setIsAssessing] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [assessment, setAssessment] = useState<PronunciationAssessment | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const isSupported = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== "undefined",
    [],
  );

  useEffect(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.stop();
    }

    mediaRecorderRef.current = null;
    chunksRef.current = [];
    stopTracks();
    stopTimer();
    setIsRecording(false);
    setIsAssessing(false);
    setAssessment(null);
    setErrorMessage(null);
    setRecordingMs(0);
    onAssessmentChange?.(null);

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [card.hanzi, card.pinyin, card.translation]);

  useEffect(() => {
    return () => {
      stopTracks();
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
    };
  }, []);

  function stopTracks() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }

  function stopTimer() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function assessBlob(audioBlob: Blob, mimeType: string, durationMs: number) {
    setIsAssessing(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, `pronunciation${mimeType.includes("ogg") ? ".ogg" : mimeType.includes("mp4") ? ".m4a" : ".webm"}`);
      formData.append("expectedHanzi", card.hanzi);
      formData.append("expectedPinyin", card.pinyin);
      formData.append("durationMs", String(durationMs));

      const response = await fetch("/api/pronunciation", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const details = await response.json().catch(() => null);
        throw new Error(
          typeof details?.details === "string"
            ? details.details
            : typeof details?.error === "string"
              ? details.error
              : "Pronunciation request failed.",
        );
      }

      const nextAssessment = (await response.json()) as PronunciationAssessment;
      setAssessment(nextAssessment);
      onAssessmentChange?.(nextAssessment);
    } catch (error) {
      setAssessment(null);
      onAssessmentChange?.(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Не удалось проверить произношение. Убедитесь, что local pronunciation server запущен.",
      );
    } finally {
      setIsAssessing(false);
    }
  }

  async function startRecording() {
    if (!isSupported || isRecording || isAssessing) {
      return;
    }

    setErrorMessage(null);
    setAssessment(null);
    onAssessmentChange?.(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const mimeType = getSupportedMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      startedAtRef.current = performance.now();
      setRecordingMs(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stopTimer();
        setIsRecording(false);

        const durationMs = Math.max(0, Math.round(performance.now() - startedAtRef.current));
        setRecordingMs(durationMs);
        stopTracks();

        const finalMimeType = recorder.mimeType || mimeType || "audio/webm";
        const audioBlob = new Blob(chunksRef.current, { type: finalMimeType });
        if (!audioBlob.size) {
          setErrorMessage("Запись получилась пустой. Попробуйте ещё раз.");
          return;
        }

        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
        setPreviewUrl(URL.createObjectURL(audioBlob));
        await assessBlob(audioBlob, finalMimeType, durationMs);
      };

      recorder.start();
      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        setRecordingMs(Math.max(0, Math.round(performance.now() - startedAtRef.current)));
      }, 160);
    } catch (error) {
      stopTracks();
      setIsRecording(false);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Не удалось открыть микрофон. Проверьте разрешение браузера.",
      );
    }
  }

  function stopRecording() {
    if (!isRecording) {
      return;
    }

    mediaRecorderRef.current?.stop();
  }

  const recommendedGradeLabel = assessment ? REVIEW_GRADE_LABELS[assessment.grade] : null;

  return (
    <div className="grid gap-4 rounded-[28px] border border-white/10 bg-white/5 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Проверка произношения</p>
          <p className="mt-1 text-sm muted-text">
            Запишите слово вслух. Локальный SenseVoice распознает речь и сравнит её с эталонным словом и пиньинем.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={[
              "rounded-full px-3 py-1 text-xs font-semibold",
              isRecording
                ? "bg-[rgba(var(--danger),0.16)] text-[rgb(var(--danger))]"
                : isAssessing
                  ? "bg-[rgba(var(--warning),0.16)] text-[rgb(var(--warning))]"
                  : "bg-white/8 text-[rgba(var(--foreground),0.72)]",
            ].join(" ")}
          >
            {isRecording ? `Запись ${formatSeconds(recordingMs)}` : isAssessing ? "Анализ..." : "Микрофон"}
          </span>

          {!isRecording ? (
            <button type="button" className="btn-secondary" disabled={!isSupported || isAssessing} onClick={startRecording}>
              {assessment ? "Записать ещё раз" : "Начать запись"}
            </button>
          ) : (
            <button type="button" className="btn-danger" onClick={stopRecording}>
              Остановить
            </button>
          )}
        </div>
      </div>

      {!isSupported ? (
        <p className="text-sm text-[rgb(var(--warning))]">
          Этот браузер не поддерживает запись через `MediaRecorder`. Для оценки произношения нужен современный Chrome, Edge или Firefox.
        </p>
      ) : null}

      {previewUrl ? <audio controls src={previewUrl} className="w-full" /> : null}

      {assessment ? (
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-[22px] border border-white/10 bg-black/10 p-4">
              <p className="subtle-text text-xs uppercase tracking-[0.16em]">Итог</p>
              <p className="mt-3 text-2xl font-semibold">{assessment.overallScore}%</p>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-black/10 p-4">
              <p className="subtle-text text-xs uppercase tracking-[0.16em]">Слово</p>
              <p className="mt-3 text-2xl font-semibold">{assessment.transcriptScore}%</p>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-black/10 p-4">
              <p className="subtle-text text-xs uppercase tracking-[0.16em]">Пиньинь</p>
              <p className="mt-3 text-2xl font-semibold">{assessment.pinyinScore}%</p>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-black/10 p-4">
              <p className="subtle-text text-xs uppercase tracking-[0.16em]">Тоны</p>
              <p className="mt-3 text-2xl font-semibold">{assessment.toneScore}%</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] border border-white/10 bg-black/10 p-4">
              <p className="subtle-text text-xs uppercase tracking-[0.16em]">Распознано</p>
              <p className="mt-3 text-lg font-semibold">{assessment.transcript || "Ничего не распознано"}</p>
              <p className="mt-2 text-sm muted-text">{assessment.recognizedPinyin || "Нет pinyin от ASR"}</p>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-black/10 p-4">
              <p className="subtle-text text-xs uppercase tracking-[0.16em]">Эталон</p>
              <p className="mt-3 text-lg font-semibold">{card.hanzi}</p>
              <p className="mt-2 text-sm muted-text">{card.pinyin}</p>
            </div>
          </div>

          <div
            className={[
              "rounded-[22px] border p-4",
              assessment.grade === "good"
                ? "border-[rgba(var(--success),0.24)] bg-[rgba(var(--success),0.08)]"
                : assessment.grade === "hard"
                  ? "border-[rgba(var(--warning),0.24)] bg-[rgba(var(--warning),0.08)]"
                  : "border-[rgba(var(--danger),0.24)] bg-[rgba(var(--danger),0.08)]",
            ].join(" ")}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold">Рекомендация системы: {recommendedGradeLabel}</p>
              <span className="text-xs uppercase tracking-[0.16em] subtle-text">{assessment.engine}</span>
            </div>
            <p className="mt-2 text-sm muted-text">{assessment.feedback}</p>
          </div>
        </div>
      ) : null}

      {errorMessage ? <p className="text-sm text-[rgb(var(--warning))]">{errorMessage}</p> : null}

      {!compact ? (
        <p className="text-xs subtle-text">
          Практическая логика score: сначала сравнивается распознанное слово, затем pinyin и отдельно совпадение тонов.
        </p>
      ) : null}
    </div>
  );
}
