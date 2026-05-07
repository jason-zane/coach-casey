import { loadAthleteProfile } from "@/lib/athlete/page-data";
import { YouEditor } from "../_you-editor";
import { Section } from "./section-shell";

export async function YouSection({
  athleteId,
  fallbackEmail,
}: {
  athleteId: string;
  fallbackEmail: string;
}) {
  const profile = await loadAthleteProfile(athleteId);
  return (
    <Section title="You">
      <YouEditor
        initial={{
          displayName: profile.displayName,
          units: profile.units,
          dateOfBirth: profile.dateOfBirth,
          weightKg: profile.weightKg,
          sex: profile.sex,
          coachingMode: profile.coachingMode,
        }}
      />
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[14px] pt-2">
        <span className="text-ink-subtle font-mono text-[11px] uppercase tracking-[0.14em] min-w-[64px]">
          Email
        </span>
        <span className="text-ink">{profile.email ?? fallbackEmail}</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[14px]">
        <span className="text-ink-subtle font-mono text-[11px] uppercase tracking-[0.14em] min-w-[64px]">
          Timezone
        </span>
        <span className={profile.timezone ? "text-ink" : "text-ink-subtle"}>
          {profile.timezone ?? ""}
        </span>
      </div>
    </Section>
  );
}
