// One-off: re-fetch the N most-recent activities from Strava and upsert
// them with the post-2026-04-29 column shape. Bypasses the webhook so it
// does not re-fire debrief / cross-training-ack notifications.
//
// Usage: node scripts/dev-refresh-recent-activities.mjs [athleteId] [count]

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const envText = readFileSync(".env.local", "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [
        l.slice(0, idx).trim(),
        l.slice(idx + 1).trim().replace(/^"|"$/g, ""),
      ];
    }),
);

const ATHLETE_ID = process.argv[2] || "eb97aff9-aa7a-4059-a352-66ea8351dde9";
const COUNT = Number(process.argv[3] || 10);

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function ensureFreshToken(athleteId) {
  const { data } = await admin
    .from("strava_connections")
    .select("access_token, refresh_token, expires_at")
    .eq("athlete_id", athleteId)
    .single();
  const expiresAtMs = new Date(data.expires_at).getTime();
  if (expiresAtMs - Date.now() > 60_000) return data.access_token;

  const r = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: data.refresh_token,
    }),
  });
  if (!r.ok) throw new Error(`refresh failed ${r.status} ${await r.text()}`);
  const t = await r.json();
  await admin
    .from("strava_connections")
    .update({
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: new Date(t.expires_at * 1000).toISOString(),
    })
    .eq("athlete_id", athleteId);
  console.log("token refreshed, new expiry", new Date(t.expires_at * 1000).toISOString());
  return t.access_token;
}

function paceSPerKm(d, t) {
  if (!d || !t) return null;
  const km = d / 1000;
  if (km <= 0) return null;
  return Math.round(t / km);
}

function rowFromDetail(d, athleteId) {
  return {
    athlete_id: athleteId,
    strava_id: d.id,
    start_date_local: d.start_date_local,
    timezone: d.timezone ?? null,
    utc_offset: d.utc_offset ?? null,
    location_city: d.location_city ?? null,
    description: d.description ?? null,
    name: d.name,
    activity_type: d.sport_type ?? d.type,
    distance_m: d.distance,
    moving_time_s: d.moving_time,
    elapsed_time_s: d.elapsed_time ?? null,
    avg_pace_s_per_km: paceSPerKm(d.distance, d.moving_time),
    avg_hr: d.average_heartrate ? Math.round(d.average_heartrate) : null,
    max_hr: d.max_heartrate ? Math.round(d.max_heartrate) : null,
    avg_watts: d.average_watts ?? null,
    max_watts: d.max_watts != null ? Math.round(d.max_watts) : null,
    weighted_avg_watts: d.weighted_average_watts ?? null,
    kilojoules: d.kilojoules ?? null,
    device_watts: d.device_watts ?? null,
    avg_cadence: d.average_cadence ?? null,
    avg_speed_m_s: d.average_speed ?? null,
    max_speed_m_s: d.max_speed ?? null,
    suffer_score: d.suffer_score ?? null,
    avg_temp_c: d.average_temp ?? null,
    elevation_gain_m: d.total_elevation_gain ?? null,
    elev_high_m: d.elev_high ?? null,
    elev_low_m: d.elev_low ?? null,
    is_manual: d.manual ?? null,
    is_trainer: d.trainer ?? null,
    is_commute: d.commute ?? null,
    raw: d,
    laps: d.laps ?? null,
    splits_metric: d.splits_metric ?? null,
    splits_standard: d.splits_standard ?? null,
    best_efforts: d.best_efforts ?? null,
    segment_efforts: d.segment_efforts ?? null,
  };
}

const token = await ensureFreshToken(ATHLETE_ID);

const { data: rows } = await admin
  .from("activities")
  .select("strava_id, start_date_local, name, activity_type")
  .eq("athlete_id", ATHLETE_ID)
  .order("start_date_local", { ascending: false })
  .limit(COUNT);

console.log(`refreshing ${rows.length} most-recent activities for ${ATHLETE_ID}`);

for (const r of rows) {
  if (!r.strava_id) continue;
  process.stdout.write(`  ${r.start_date_local.slice(0, 10)} [${r.activity_type}] ${r.name?.slice(0, 30) ?? "?"} ... `);
  try {
    const res = await fetch(
      `https://www.strava.com/api/v3/activities/${r.strava_id}?include_all_efforts=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      console.log(`HTTP ${res.status}`);
      continue;
    }
    const detail = await res.json();
    const row = rowFromDetail(detail, ATHLETE_ID);
    const { error } = await admin
      .from("activities")
      .upsert(row, { onConflict: "athlete_id,strava_id" });
    if (error) {
      console.log(`upsert error: ${error.message}`);
    } else {
      const splits = detail.splits_metric?.length ?? 0;
      const be = detail.best_efforts?.length ?? 0;
      const segs = detail.segment_efforts?.length ?? 0;
      const laps = detail.laps?.length ?? 0;
      console.log(`ok (laps=${laps} splits=${splits} best_efforts=${be} segs=${segs})`);
    }
    await new Promise((r) => setTimeout(r, 600));
  } catch (e) {
    console.log(`failed: ${e.message}`);
  }
}
