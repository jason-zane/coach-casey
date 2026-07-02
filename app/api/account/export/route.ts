import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { recordAuditEvent } from "@/lib/audit/log";
import {
  EXPORT_TABLE_SECTIONS,
  type ExportTableSection,
} from "@/lib/account/export-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Athlete data export. Returns a JSON dump of every row Coach Casey holds
 * about the requesting athlete. Required by Privacy Policy commitments
 * and by GDPR / UK GDPR / CCPA / Privacy Act portability rights.
 *
 * Auth: Supabase session cookie. Admin client is used to read the full
 * set; we still scope every query by the resolved athlete_id so we can
 * never accidentally return another athlete's data.
 *
 * The table list lives in lib/account/export-tables.ts and is checked
 * against the migrations by tests/account-export.test.ts.
 *
 * Resilience: a single unreadable table must not take down the whole
 * export (this endpoint backs a legal commitment, and a total 500 leaves
 * the athlete with nothing). A failed section is exported as null with an
 * entry in export_metadata.warnings; only failing to resolve the athlete
 * itself is fatal.
 *
 * Strava OAuth tokens are deliberately excluded, the athlete already has
 * their data on Strava and exposing the access token serves no
 * portability purpose.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: athlete, error: athleteError } = await admin
    .from("athletes")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (athleteError) {
    console.error("account export athlete lookup failed", athleteError);
    return NextResponse.json({ error: "export failed" }, { status: 500 });
  }

  if (!athlete) {
    return NextResponse.json({ error: "athlete not found" }, { status: 404 });
  }

  const athleteId = (athlete as { id: string }).id;

  type AnyRow = Record<string, unknown>;

  const warnings: string[] = [];
  const warn = (section: string, err: unknown) => {
    console.error(`account export: ${section} failed`, err);
    warnings.push(
      `${section}: could not be read; exported as null instead of its data. ` +
        "Retry later or contact support for a complete copy.",
    );
  };

  const fetchSection = async (
    s: ExportTableSection,
  ): Promise<AnyRow[] | null> => {
    try {
      let q = admin
        .from(s.table)
        .select(s.columns ?? "*")
        .eq("athlete_id", athleteId);
      if (s.order) q = q.order(s.order, { ascending: true });
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data as unknown as AnyRow[] | null) ?? [];
    } catch (err) {
      warn(s.table, err);
      return null;
    }
  };

  // Singleton rows read outside the generic loop. The Strava connection is
  // narrowed to strip OAuth secrets.
  const fetchSingle = async (
    section: string,
    table: string,
    columns: string,
  ): Promise<AnyRow | null> => {
    try {
      const { data, error } = await admin
        .from(table)
        .select(columns)
        .eq("athlete_id", athleteId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as AnyRow | null) ?? null;
    } catch (err) {
      warn(section, err);
      return null;
    }
  };

  const [sectionRows, stravaConnection, preferencesRow] = await Promise.all([
    Promise.all(EXPORT_TABLE_SECTIONS.map(fetchSection)),
    fetchSingle(
      "strava_connection",
      "strava_connections",
      "athlete_id, strava_athlete_id, scope, is_mock, connected_at, created_at, updated_at",
    ),
    fetchSingle("preferences", "preferences", "*"),
  ]);

  const sections: Record<string, AnyRow[] | null> = {};
  EXPORT_TABLE_SECTIONS.forEach((s, i) => {
    sections[s.table] = sectionRows[i];
  });

  const payload = {
    export_metadata: {
      generated_at: new Date().toISOString(),
      // v2: added activity_notes and coach_messages sections, dropped the
      // never-populated activity_laps key (laps are embedded in each
      // activities row), added complete/warnings.
      coach_casey_export_version: 2,
      athlete_id: athleteId,
      complete: warnings.length === 0,
      warnings,
      notes:
        "Full athlete-owned data export. Strava OAuth tokens are excluded. " +
        "Lap data is embedded in each activity row under 'laps'. " +
        "See Privacy Policy at /privacy for context on retention and deletion.",
    },
    athlete,
    strava_connection: stravaConnection,
    preferences: preferencesRow,
    ...sections,
  };

  await recordAuditEvent({
    actorType: "athlete",
    actorId: athleteId,
    action: "account.export",
    targetAthleteId: athleteId,
    metadata: { complete: warnings.length === 0, warning_count: warnings.length },
  });

  const filename = `coach-casey-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
