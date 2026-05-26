"use client";

import { FormEvent, useState } from "react";
import { Check, Plus, Trash2, UserRound, X } from "lucide-react";
import { useStudy } from "@/context/study-context";

type AccountSwitcherProps = {
  compact?: boolean;
};

export function AccountSwitcher({ compact = false }: AccountSwitcherProps) {
  const { accounts, activeAccount, activeAccountId, createAccount, deleteAccount, hydrated, switchAccount } = useStudy();
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createAccount(name);
    setName("");
    setIsAdding(false);
  }

  function handleDelete() {
    if (accounts.length <= 1) {
      return;
    }

    if (window.confirm(`Удалить аккаунт "${activeAccount.name}" вместе с его статистикой?`)) {
      deleteAccount(activeAccountId);
    }
  }

  return (
    <div className={["grid gap-2", compact ? "w-full" : ""].join(" ")}>
      <div className="flex min-w-0 items-center gap-2">
        {!compact ? (
          <span className="icon-tile h-9 w-9">
            <UserRound size={15} />
          </span>
        ) : null}
        <label className="sr-only" htmlFor={compact ? "account-switcher-mobile" : "account-switcher-desktop"}>
          Аккаунт
        </label>
        <select
          id={compact ? "account-switcher-mobile" : "account-switcher-desktop"}
          value={activeAccountId}
          disabled={!hydrated}
          className="min-w-0 flex-1 rounded-[14px] px-3 py-2 text-sm"
          onChange={(event) => switchAccount(event.target.value)}
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="theme-toggle h-9 min-h-9 w-9"
          aria-label="Добавить аккаунт"
          title="Добавить аккаунт"
          onClick={() => setIsAdding((value) => !value)}
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          className="theme-toggle h-9 min-h-9 w-9"
          aria-label="Удалить аккаунт"
          title="Удалить аккаунт"
          disabled={accounts.length <= 1}
          onClick={handleDelete}
        >
          <Trash2 size={15} />
        </button>
      </div>

      {isAdding ? (
        <form className="flex min-w-0 items-center gap-2" onSubmit={handleCreate}>
          <input
            value={name}
            className="min-w-0 flex-1 rounded-[14px] px-3 py-2 text-sm"
            placeholder={`Аккаунт ${accounts.length + 1}`}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
          <button type="submit" className="theme-toggle h-9 min-h-9 w-9" aria-label="Создать аккаунт">
            <Check size={15} />
          </button>
          <button
            type="button"
            className="theme-toggle h-9 min-h-9 w-9"
            aria-label="Отмена"
            onClick={() => {
              setName("");
              setIsAdding(false);
            }}
          >
            <X size={15} />
          </button>
        </form>
      ) : null}
    </div>
  );
}
