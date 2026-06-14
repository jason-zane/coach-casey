import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { listAccessRequests } from "@/lib/admin/access-requests";
import { SITE_URL } from "@/lib/site-url";
import { StatusSelect } from "./_status-select";
import { CopyInvite } from "./_copy-invite";

export const dynamic = "force-dynamic";

/**
 * Early-access requests surface. Lists everyone who asked for access via the
 * public form, with one-tap status management and the shared invite link to
 * send them. Gated by ADMIN_EMAILS (requireAdmin); the table is service-role
 * only, so nothing here is reachable without the gate.
 */
export default async function AccessRequestsPage() {
  const gate = await requireAdmin();
  if (!gate.ok) redirect(gate.redirect);

  const requests = await listAccessRequests();
  const pending = requests.filter((r) => r.status === "pending").length;

  const code = process.env.SIGNUP_ACCESS_CODE ?? "";
  const inviteUrl = code
    ? `${SITE_URL}/signup?code=${encodeURIComponent(code)}`
    : null;

  return (
    <div className="min-h-svh bg-paper text-ink">
      <div className="mx-auto max-w-[960px] px-5 sm:px-8 py-10 space-y-8">
        <header className="space-y-2">
          <Link
            href="/app/admin"
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle hover:text-ink-muted transition-colors duration-150 inline-flex items-center gap-1"
          >
            <span aria-hidden>‹</span>
            <span>Back to admin</span>
          </Link>
          <h1
            className="text-[28px] leading-tight font-medium text-ink"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Early access
          </h1>
          <p className="text-[13px] leading-[1.55] text-ink-muted">
            {pending > 0
              ? `${pending} pending request${pending === 1 ? "" : "s"}.`
              : "No pending requests."}{" "}
            Send someone the invite link, then mark them invited.
          </p>
        </header>

        <section className="space-y-2">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
            Shared invite link
          </h2>
          {inviteUrl ? (
            <CopyInvite url={inviteUrl} />
          ) : (
            <p className="text-[13px] text-red-700">
              SIGNUP_ACCESS_CODE is not set, so there&rsquo;s no invite link to
              share. Set it in the environment to generate one.
            </p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
            Requests
          </h2>
          <div className="overflow-x-auto rounded-md border border-rule">
            <table className="w-full font-sans text-[12px] text-ink">
              <thead className="bg-surface text-ink-muted">
                <tr>
                  <Th>When</Th>
                  <Th>Name / email</Th>
                  <Th>Training for</Th>
                  <Th>Status</Th>
                  <Th>Send</Th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-t border-rule align-top">
                    <Td>{shortDateTime(r.createdAt)}</Td>
                    <Td>
                      <div className="text-ink">{r.name ?? "-"}</div>
                      <a
                        href={`mailto:${r.email}`}
                        className="text-ink-subtle underline-offset-2 hover:underline"
                      >
                        {r.email}
                      </a>
                    </Td>
                    <Td>
                      <span className="text-ink-muted">{r.note ?? "-"}</span>
                    </Td>
                    <Td>
                      <StatusSelect id={r.id} status={r.status} />
                    </Td>
                    <Td>
                      {inviteUrl ? (
                        <a
                          href={mailtoInvite(r.email, r.name, inviteUrl)}
                          className="font-mono text-[11px] uppercase tracking-[0.12em] text-accent underline-offset-2 hover:underline"
                        >
                          email link
                        </a>
                      ) : (
                        <span className="text-ink-subtle">-</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {requests.length === 0 && (
            <p className="text-[13px] text-ink-muted">
              No requests yet. They&rsquo;ll appear here the moment someone fills
              out the form on the site.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

/** Prefilled email to the requester carrying the invite link. */
function mailtoInvite(email: string, name: string | null, inviteUrl: string) {
  const subject = "Your Coach Casey invite";
  const body = [
    `Hi${name ? ` ${name.split(" ")[0]}` : ""},`,
    "",
    "Thanks for asking to try Coach Casey. Here's your link to get started:",
    inviteUrl,
    "",
    "It'll walk you through connecting Strava and your goal race. Shout if you hit anything.",
    "",
    "Jason",
  ].join("\n");
  return `mailto:${email}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.14em] font-medium">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 align-top">{children}</td>;
}

function shortDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
