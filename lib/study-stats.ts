import type { PersistedAppState } from "@/lib/storage";
import type { StudySessionInput, StudySessionLogEntry, StudyStats } from "@/lib/types";
import { dayKey } from "@/lib/utils";

const STUDY_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function cleanDailyStudyLog(dailyStudyLog: Record<string, number>) {
  const cleaned: Record<string, number> = {};

  Object.entries(dailyStudyLog).forEach(([key, value]) => {
    if (STUDY_DATE_PATTERN.test(key) && Number.isFinite(value) && value > 0) {
      cleaned[key] = Math.round(value);
    }
  });

  return cleaned;
}

function getLastStudyDate(dailyStudyLog: Record<string, number>) {
  return Object.keys(dailyStudyLog)
    .filter((key) => dailyStudyLog[key] > 0)
    .sort()
    .at(-1) ?? null;
}

function getCurrentStreakDays(dailyStudyLog: Record<string, number>, now: Date) {
  let streakDays = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  while ((dailyStudyLog[dayKey(cursor)] ?? 0) > 0) {
    streakDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streakDays;
}

function syncStatsCalendar(stats: StudyStats, now: Date) {
  const today = dayKey(now);
  const dailyStudyLog = cleanDailyStudyLog(stats.dailyStudyLog);

  return {
    ...stats,
    dailyStudyLog,
    todayStudyTime: dailyStudyLog[today] ?? 0,
    streakDays: getCurrentStreakDays(dailyStudyLog, now),
    lastStudyDate: getLastStudyDate(dailyStudyLog),
  };
}

export function normalizeStateForToday(state: PersistedAppState) {
  return { ...state, stats: syncStatsCalendar(state.stats, new Date()) };
}

export function recordStudyTime(stats: StudyStats, now: Date, durationMs: number) {
  const normalized = syncStatsCalendar(stats, now);
  const today = dayKey(now);
  const dailyStudyLog = {
    ...normalized.dailyStudyLog,
    [today]: (normalized.dailyStudyLog[today] ?? 0) + durationMs,
  };

  return syncStatsCalendar({
    ...normalized,
    totalStudyTime: normalized.totalStudyTime + durationMs,
    sessionStudyTime: normalized.sessionStudyTime + durationMs,
    dailyStudyLog,
  }, now);
}

export function createStudySession(input: StudySessionInput, now: Date): StudySessionLogEntry | null {
  const durationMs = Math.round(input.durationMs);
  if (!STUDY_DATE_PATTERN.test(input.date) || !Number.isFinite(durationMs) || durationMs <= 0) return null;

  return {
    id: `session-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    date: input.date,
    title: input.title.trim() || "Учебная сессия",
    activity: input.activity,
    durationMs,
    note: input.note?.trim() ?? "",
    createdAt: now.toISOString(),
  };
}

export function recordStudySession(stats: StudyStats, session: StudySessionLogEntry, now: Date) {
  const normalized = syncStatsCalendar(stats, now);
  const dailyStudyLog = {
    ...normalized.dailyStudyLog,
    [session.date]: (normalized.dailyStudyLog[session.date] ?? 0) + session.durationMs,
  };

  return syncStatsCalendar({
    ...normalized,
    totalStudyTime: normalized.totalStudyTime + session.durationMs,
    dailyStudyLog,
    studySessions: [session, ...normalized.studySessions],
  }, now);
}

export function removeStudySession(stats: StudyStats, session: StudySessionLogEntry, now: Date) {
  const normalized = syncStatsCalendar(stats, now);
  const nextDayTotal = Math.max(0, (normalized.dailyStudyLog[session.date] ?? 0) - session.durationMs);
  const dailyStudyLog = { ...normalized.dailyStudyLog, [session.date]: nextDayTotal };
  if (nextDayTotal <= 0) delete dailyStudyLog[session.date];

  return syncStatsCalendar({
    ...normalized,
    totalStudyTime: Math.max(0, normalized.totalStudyTime - session.durationMs),
    dailyStudyLog,
    studySessions: normalized.studySessions.filter((entry) => entry.id !== session.id),
  }, now);
}

export function normalizeStatsForToday(stats: StudyStats, now: Date) {
  return syncStatsCalendar(stats, now);
}
