"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = {
  href: string;
  label: string;
  badge?: number;
  isActive: (pathname: string) => boolean;
};

function navItems(pendingAccess: number, unread: number): Item[] {
  return [
    {
      href: "/admin",
      label: "Overview",
      isActive: (p) => p === "/admin",
    },
    {
      href: "/admin/athletes",
      label: "Athletes",
      isActive: (p) => p === "/admin/athletes" || p.startsWith("/admin/athletes/"),
    },
    {
      href: "/admin/access",
      label: "Early access",
      badge: pendingAccess,
      isActive: (p) => p.startsWith("/admin/access"),
    },
    {
      href: "/admin/messages",
      label: "Messages",
      badge: unread,
      isActive: (p) => p.startsWith("/admin/messages"),
    },
    {
      href: "/admin/observability",
      label: "Observability",
      isActive: (p) => p.startsWith("/admin/observability"),
    },
  ];
}

function Badge({ count }: { count: number }) {
  return (
    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 font-mono text-[9px] leading-none text-accent-ink">
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Console navigation. `rail` is the desktop sidebar (vertical, in the left
 * aside); `bar` is the phone variant — a horizontally scrollable row of
 * chips under the mobile header. Same items, same active logic.
 */
export function AdminNav({
  pendingAccess,
  unread,
  variant = "rail",
}: {
  pendingAccess: number;
  unread: number;
  variant?: "rail" | "bar";
}) {
  const pathname = usePathname();
  const items = navItems(pendingAccess, unread);

  if (variant === "bar") {
    return (
      <nav className="flex items-center gap-1.5 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none]">
        {items.map((item) => {
          const active = item.isActive(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 font-sans text-[12.5px] whitespace-nowrap transition-colors ${
                active
                  ? "border-accent/30 bg-accent/10 text-ink"
                  : "border-rule text-ink-muted hover:text-ink"
              }`}
            >
              {item.label}
              {item.badge && item.badge > 0 ? <Badge count={item.badge} /> : null}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-0.5 px-3">
      {items.map((item) => {
        const active = item.isActive(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center justify-between rounded-md px-3 py-2 font-sans text-[13.5px] transition-colors ${
              active
                ? "bg-accent/10 text-ink"
                : "text-ink-muted hover:bg-paper hover:text-ink"
            }`}
          >
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${
                  active ? "bg-accent" : "bg-transparent"
                }`}
              />
              {item.label}
            </span>
            {item.badge && item.badge > 0 ? <Badge count={item.badge} /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
