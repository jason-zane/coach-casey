import Link from "next/link";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  stepOrderFor,
  type OnboardingStep,
} from "@/lib/onboarding/steps";
import { PageFade } from "./_page-fade";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: athlete } = await supabase
    .from("athletes")
    .select("onboarding_current_step")
    .eq("user_id", user.id)
    .maybeSingle();

  const ua = (await headers()).get("user-agent");
  const order = stepOrderFor(ua);
  const current = (athlete?.onboarding_current_step ??
    "strava") as OnboardingStep;
  const currentIdx = Math.max(order.indexOf(current), 0);

  return (
    <div className="min-h-dvh bg-paper text-ink flex flex-col">
      <header className="border-b border-rule/60">
        <div className="mx-auto max-w-2xl px-6 py-5 flex items-center justify-between">
          <Link
            href="/"
            className="font-serif text-base italic text-ink"
            aria-label="Coach Casey"
          >
            Coach Casey
          </Link>
          <nav
            aria-label="Onboarding progress"
            className="flex items-center gap-1.5"
          >
            {order.map((s, i) => {
              const isDone = i < currentIdx;
              const isCurrent = i === currentIdx;
              // Visible against both paper and dark-mode backgrounds:
              //   done      — filled accent (plum)
              //   current   — filled ink, slightly larger
              //   upcoming  — outlined with ink-subtle (contrasts in both modes)
              return (
                <span
                  key={s}
                  aria-current={isCurrent ? "step" : undefined}
                  className={`rounded-full transition-all ${
                    isCurrent
                      ? "h-2.5 w-2.5 bg-ink"
                      : "h-2 w-2 " +
                        (isDone
                          ? "bg-accent"
                          : "border-[1.5px] border-ink-subtle bg-transparent")
                  }`}
                />
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-6 py-10 md:py-16">
          <PageFade>{children}</PageFade>
        </div>
      </main>
    </div>
  );
}
