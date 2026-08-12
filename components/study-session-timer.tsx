"use client";

import { useEffect, useRef, useState } from "react";
import { useStudy } from "@/context/study-context";
import { formatDuration } from "@/lib/utils";

const TICK_MS = 1000;
const FLUSH_INTERVAL_MS = 15_000;

/**
 * Keeps the live clock local to this tiny component and writes study time to
 * the global store in batches. This prevents the entire app and card database
 * from being re-rendered and persisted every second.
 */
export function StudySessionTimer({ className }: { className?: string }) {
  const { addStudyTime, stats } = useStudy();
  const [displayedTime, setDisplayedTime] = useState(() => stats.sessionStudyTime);
  const pendingTimeRef = useRef(0);
  const addStudyTimeRef = useRef(addStudyTime);

  useEffect(() => {
    addStudyTimeRef.current = addStudyTime;
  }, [addStudyTime]);

  useEffect(() => {
    function flushPendingTime() {
      const pendingTime = pendingTimeRef.current;
      if (pendingTime <= 0) {
        return;
      }

      pendingTimeRef.current = 0;
      addStudyTimeRef.current(pendingTime);
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        flushPendingTime();
      }
    }

    const timer = window.setInterval(() => {
      if (document.hidden) {
        return;
      }

      pendingTimeRef.current += TICK_MS;
      setDisplayedTime((current) => current + TICK_MS);

      if (pendingTimeRef.current >= FLUSH_INTERVAL_MS) {
        flushPendingTime();
      }
    }, TICK_MS);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", flushPendingTime);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", flushPendingTime);
      flushPendingTime();
    };
  }, []);

  return <span className={className}>{formatDuration(displayedTime)}</span>;
}
