import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { listAccessRequests } from "@/lib/admin/access-requests";
import { countAdminUnread } from "@/lib/coach-messages";
import { signOutAdmin } from "@/app/actions/admin-auth";
import { AdminNav } from "./_components/nav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

/**
 * Admin console shell. Desktop: a persistent left rail of sections and a wide
 * content column. Phone: the rail collapses into a sticky header — wordmark +
 * sign-out on the first row, the same nav as a scrollable chip bar beneath.
 * Gated by requireAdmin (the proxy already enforces the same allowlist before
 * this renders; this is defence in depth and gives the shell the signed-in
 * admin's email).
 */
export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) redirect("/admin/login");

  const [requests, unread] = await Promise.all([
    listAccessRequests(),
    countAdminUnread(),
  ]);
  const pendingAccess = requests.filter((r) => r.status === "pending").length;

  const wordmark = (
    <Link href="/admin" className="block">
      <span
        className="text-[18px] font-medium text-ink"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Coach Casey
      </span>
      <span className="ml-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
        admin
      </span>
    </Link>
  );

  return (
    <div className="flex min-h-svh flex-col bg-paper text-ink md:flex-row">
      {/* Phone: sticky header with a horizontal nav bar. */}
      <header className="sticky top-0 z-10 border-b border-rule bg-surface md:hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          {wordmark}
          <form action={signOutAdmin}>
            <button
              type="submit"
              className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle transition-colors hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
        <AdminNav pendingAccess={pendingAccess} unread={unread} variant="bar" />
      </header>

      {/* Desktop: persistent left rail. */}
      <aside className="sticky top-0 hidden h-svh w-[244px] shrink-0 flex-col border-r border-rule bg-surface md:flex">
        <div className="px-5 py-6">{wordmark}</div>

        <AdminNav pendingAccess={pendingAccess} unread={unread} />

        <div className="mt-auto border-t border-rule px-5 py-4">
          <p
            className="truncate font-mono text-[11px] text-ink-muted"
            title={gate.user.email ?? undefined}
          >
            {gate.user.email ?? "signed in"}
          </p>
          <form action={signOutAdmin} className="mt-2">
            <button
              type="submit"
              className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle transition-colors hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-10 md:py-10">
          {children}
        </div>
      </main>
    </div>
  );
}
