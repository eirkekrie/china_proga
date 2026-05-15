"use client";

import { useEffect, useRef, useState } from "react";

type CopyButtonProps = {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
};

async function writeTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard is unavailable");
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";

  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Copy command failed");
  }
}

export function CopyButton({
  text,
  label = "Копировать",
  copiedLabel = "Скопировано",
  className = "",
}: CopyButtonProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const resetTimerRef = useRef<number | null>(null);
  const isDisabled = text.trim().length === 0;

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  async function handleCopy() {
    if (isDisabled) {
      return;
    }

    try {
      await writeTextToClipboard(text);
      setStatus("copied");
    } catch {
      setStatus("error");
    }

    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }

    resetTimerRef.current = window.setTimeout(() => {
      setStatus("idle");
      resetTimerRef.current = null;
    }, 1600);
  }

  const currentLabel = status === "copied" ? copiedLabel : status === "error" ? "Не вышло" : label;

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={() => void handleCopy()}
      className={[
        "inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-xs font-semibold transition",
        status === "copied"
          ? "border-[rgba(var(--success),0.36)] bg-[rgba(var(--success),0.12)] text-[rgb(var(--success))]"
          : status === "error"
            ? "border-[rgba(var(--danger),0.32)] bg-[rgba(var(--danger),0.12)] text-[rgb(var(--danger))]"
            : "border-white/10 bg-black/10 text-[rgba(var(--foreground),0.82)] hover:bg-white/10",
        isDisabled ? "cursor-not-allowed opacity-60" : "",
        className,
      ].join(" ")}
      title={currentLabel}
      aria-live="polite"
    >
      {currentLabel}
    </button>
  );
}