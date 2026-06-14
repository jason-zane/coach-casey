import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current";
import { getConversation, markRead } from "@/lib/coach-messages";
import { replyToCoach } from "@/app/actions/coach-messages";
import { CoachThread } from "@/app/(app)/app/_components/coach-thread";
import { CoachComposer } from "@/app/(app)/app/_components/coach-composer";

export const dynamic = "force-dynamic";

/**
 * The athlete's direct line to Jason (a human), kept separate from the Casey
 * thread. Replies go to Jason, not Casey. Opening the page marks his messages
 * read.
 */
export default async function MessagesPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  if (!session.athlete) redirect("/app");
  const athlete = session.athlete;

  const messages = await getConversation(athlete.id);
  await markRead(athlete.id, "athlete");

  return (
    <div className="min-h-svh bg-paper text-ink">
      <div className="mx-auto flex min-h-svh max-w-[680px] flex-col px-5 sm:px-8 py-8">
        <header className="space-y-2 pb-6">
          <Link
            href="/app"
            className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em] text-accent hover:opacity-80 transition-opacity duration-150"
          >
            <span aria-hidden>‹</span>
            <span>Back to Casey</span>
          </Link>
          <h1
            className="text-[24px] leading-tight font-medium text-ink"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Messages with Jason
          </h1>
          <p className="text-[13px] leading-[1.55] text-ink-muted">
            You&rsquo;re talking to Jason here, the human who built Coach Casey,
            not Casey itself. He reads every reply. To chat with Casey instead,{" "}
            <Link
              href="/app"
              className="text-accent underline underline-offset-2"
            >
              go back to your thread
            </Link>
            .
          </p>
        </header>

        <div className="flex-1">
          <CoachThread messages={messages} viewer="athlete" otherLabel="Jason" />
        </div>

        <div className="sticky bottom-0 bg-paper pt-4 space-y-2">
          <CoachComposer action={replyToCoach} placeholder="Reply to Jason…" />
          <p className="text-center font-mono text-[10px] uppercase tracking-[0.12em] text-ink-subtle">
            Replies go to Jason ·{" "}
            <Link href="/app" className="text-accent hover:underline">
              talk to Casey
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
