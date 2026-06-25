"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = {
  href: string;
  label: string;
  badge?: number;
  isActive: (pathname: string) => boolean;
};

export function AdminNav({
  pendingAccess,
  unread,
}: {
  pendingAccess: number;
  unread: number;
}) {
  const pathname = usePathname();

  const items: Item[] = [
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
            {item.badge && item.badge > 0 ? (
              <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 font-mono text-[9px] leading-none text-accent-ink">
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
