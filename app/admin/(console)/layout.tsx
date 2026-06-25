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
 * Desktop admin console shell: a persistent left rail of sections and a wide
 * content column. Gated by requireAdmin (the proxy already enforces the same
 * allowlist before this renders; this is defence in depth and gives the rail
 * the signed-in admin's email).
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

  return (
    <div className="flex min-h-svh bg-paper text-ink">
      <aside className="sticky top-0 flex h-svh w-[244px] shrink-0 flex-col border-r border-rule bg-surface">
        <div className="px-5 py-6">
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
        </div>

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
        <div className="mx-auto max-w-[1180px] px-6 py-10 sm:px-10">
          {children}
        </div>
      </main>
    </div>
  );
}
