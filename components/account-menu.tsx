"use client";

import { LogOut, UserRound } from "lucide-react";
import { useStudy } from "@/context/study-context";

export function AccountMenu() {
  const { authUser, logout } = useStudy();

  if (!authUser) {
    return null;
  }

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-[14px] border border-[rgba(var(--border),0.12)] bg-[rgba(var(--panel),0.36)] p-2">
      <span className="icon-tile h-9 w-9">
        <UserRound size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{authUser.name}</p>
        <p className="truncate text-[11px] muted-text">{authUser.email}</p>
      </div>
      <button type="button" className="theme-toggle h-9 min-h-9 w-9" aria-label="Выйти" title="Выйти" onClick={logout}>
        <LogOut size={15} />
      </button>
    </div>
  );
}
