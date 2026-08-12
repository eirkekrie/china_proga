"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  BookOpen,
  Brain,
  Ellipsis,
  Flame,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  Music2,
  TrendingUp,
} from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import { AuthPanel } from "@/components/auth-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { useStudy } from "@/context/study-context";

type NavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  icon: ComponentType<{ size?: number; className?: string }>;
};

const primaryNav: NavItem[] = [
  { href: "/", label: "Сегодня", icon: LayoutDashboard },
  { href: "/learn", label: "Учить новое", shortLabel: "Учить", icon: GraduationCap },
  { href: "/review", label: "Повторить", shortLabel: "Повтор", icon: Brain },
];

const secondaryNav: NavItem[] = [
  { href: "/test", label: "Проверка знаний", shortLabel: "Тест", icon: ListChecks },
  { href: "/tones", label: "Тренировка тонов", shortLabel: "Тоны", icon: Music2 },
  { href: "/cards", label: "Мои карточки", shortLabel: "Карточки", icon: BookOpen },
  { href: "/stats", label: "Прогресс", icon: TrendingUp },
];

const mobilePrimaryNav = [primaryNav[0], primaryNav[1], primaryNav[2], secondaryNav[2]];
const mobileMoreNav = [secondaryNav[0], secondaryNav[1], secondaryNav[3]];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;

  return (
    <Link
      prefetch={false}
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={["nav-chip", active ? "is-active" : ""].join(" ")}
    >
      <span className="nav-icon"><Icon size={17} /></span>
      <span>{item.label}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { authStatus, hydrated, metrics, stats } = useStudy();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenuOpen]);

  if (hydrated && authStatus === "unauthenticated") {
    return <AuthPanel />;
  }

  return (
    <div className="app-shell min-h-screen">
      <div className="pointer-events-none fixed inset-0 soft-grid opacity-30" />

      <header className="mobile-header app-header sticky top-0 z-40 border-b lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Link prefetch={false} href="/" className="brand-lockup">
            <span className="brand-mark">漢</span>
            <span>
              <span className="brand-name">Hanzi Flow</span>
              <span className="brand-kicker">Каждый день понемногу</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            {hydrated && metrics.dueTodayCount > 0 ? (
              <Link prefetch={false} href="/review" className="top-stat" aria-label="Карточки к повторению">
                <Flame size={14} />
                <strong>{metrics.dueTodayCount}</strong>
              </Link>
            ) : null}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <nav className="mobile-bottom-nav lg:hidden" aria-label="Основная навигация">
        {mobilePrimaryNav.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              prefetch={false}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={["mobile-nav-item", active ? "is-active" : ""].join(" ")}
            >
              <span><Icon size={20} /></span>
              <small>{item.shortLabel ?? item.label}</small>
              {item.href === "/review" && hydrated && metrics.dueTodayCount > 0 ? (
                <b>{Math.min(99, metrics.dueTodayCount)}</b>
              ) : null}
            </Link>
          );
        })}
        <button
          type="button"
          className={["mobile-nav-item", mobileMoreNav.some((item) => item.href === pathname) || mobileMenuOpen ? "is-active" : ""].join(" ")}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-more-menu"
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          <span><Ellipsis size={21} /></span>
          <small>Ещё</small>
        </button>
      </nav>

      {mobileMenuOpen ? (
        <div className="mobile-menu-scrim lg:hidden" onClick={() => setMobileMenuOpen(false)}>
          <section
            id="mobile-more-menu"
            className="mobile-more-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Дополнительная навигация"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mobile-more-handle" />
            <p className="mobile-more-title">Дополнительно</p>
            <nav className="mobile-more-links" aria-label="Дополнительная навигация">
              {mobileMoreNav.map((item) => <NavLink key={item.href} item={item} active={pathname === item.href} />)}
            </nav>
            <div className="mobile-more-account"><AccountMenu /></div>
          </section>
        </div>
      ) : null}

      <aside className="desktop-sidebar hidden lg:flex">
        <div>
          <Link prefetch={false} href="/" className="brand-lockup px-1">
            <span className="brand-mark">漢</span>
            <span>
              <span className="brand-name">Hanzi Flow</span>
              <span className="brand-kicker">Каждый день понемногу</span>
            </span>
          </Link>

          <nav className="mt-9 grid gap-1.5" aria-label="Обучение">
            <p className="nav-section-label">Обучение</p>
            {primaryNav.map((item) => (
              <NavLink key={item.href} item={item} active={pathname === item.href} />
            ))}
          </nav>

          <nav className="mt-7 grid gap-1.5" aria-label="Дополнительно">
            <p className="nav-section-label">Дополнительно</p>
            {secondaryNav.map((item) => (
              <NavLink key={item.href} item={item} active={pathname === item.href} />
            ))}
          </nav>
        </div>

        <div className="grid gap-4 border-t border-[rgba(var(--border),0.14)] pt-5">
          {hydrated ? (
            <div className="sidebar-today">
              <div>
                <span>Сегодня</span>
                <strong>{metrics.dueTodayCount > 0 ? `${metrics.dueTodayCount} к повтору` : "Всё повторено"}</strong>
              </div>
              <div className="sidebar-today-progress" aria-hidden="true">
                <span style={{ width: `${Math.min(100, Math.round(stats.todayStudyTime / 600))}%` }} />
              </div>
            </div>
          ) : null}
          <AccountMenu />
          <ThemeToggle />
        </div>
      </aside>

      <main className="app-main">{children}</main>
    </div>
  );
}
