import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { listAccessRequests } from "@/lib/admin/access-requests";
import { SITE_URL } from "@/lib/site-url";
import { StatusSelect } from "@/app/(app)/app/admin/access/_status-select";
import { CopyInvite } from "@/app/(app)/app/admin/access/_copy-invite";
import {
  PageHeader,
  Section,
  TableShell,
  Th,
  Td,
  shortDateTime,
} from "../_components/ui";

export const dynamic = "force-dynamic";

/**
 * Early-access requests. Same data and actions as the in-app admin, laid out
 * wide for desktop: the shared invite link, then every request with one-tap
 * status management and a prefilled invite email.
 */
export default async function AccessPage() {
  const gate = await requireAdmin();
  if (!gate.ok) redirect("/admin/login");

  const requests = await listAccessRequests();
  const pending = requests.filter((r) => r.status === "pending").length;

  const code = process.env.SIGNUP_ACCESS_CODE ?? "";
  const inviteUrl = code
    ? `${SITE_URL}/signup?code=${encodeURIComponent(code)}`
    : null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Console"
        title="Early access"
        lede={
          <>
            {pending > 0
              ? `${pending} pending request${pending === 1 ? "" : "s"}.`
              : "No pending requests."}{" "}
            Send someone the invite link, then mark them invited.
          </>
        }
      />

      <Section title="Shared invite link">
        {inviteUrl ? (
          <CopyInvite url={inviteUrl} />
        ) : (
          <p className="text-[13px] text-red-700">
            SIGNUP_ACCESS_CODE is not set, so there&rsquo;s no invite link to
            share. Set it in the environment to generate one.
          </p>
        )}
      </Section>

      <Section title="Requests">
        <TableShell>
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
                  <div className="text-ink">{r.name ?? "—"}</div>
                  <a
                    href={`mailto:${r.email}`}
                    className="text-ink-subtle underline-offset-2 hover:underline"
                  >
                    {r.email}
                  </a>
                </Td>
                <Td>
                  <span className="text-ink-muted">{r.note ?? "—"}</span>
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
                    <span className="text-ink-subtle">—</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
        {requests.length === 0 && (
          <p className="text-[13px] text-ink-muted">
            No requests yet. They&rsquo;ll appear here the moment someone fills
            out the form on the site.
          </p>
        )}
      </Section>
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
