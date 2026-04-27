// One-time wipe-and-seed for screenshot capture.
//
// Usage: node scripts/seed-screenshots.mjs
//
// Wipes activities, messages, activity_notes, and memory_items for the
// athlete tied to ATHLETE_EMAIL below, then seeds 21 days of plausible
// marathon-block data (runs + cross-training) so the thread, debrief
// layout, and stat rows screenshot well.
//
// Keeps `goal_races`, `training_plans`, and the athlete row itself. The
// seeded `goal_races` row replaces any existing active row so the
// about-you page screenshots cleanly.
//
// Synthetic activities have synthetic strava_ids; the Strava description
// writeback path will silently no-op (no real activity to update).

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const ATHLETE_EMAIL = "jasonzanehunt@gmail.com";

// ---------- env loader ----------
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

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ---------- helpers ----------
const TODAY = new Date("2026-04-28T07:30:00+10:00"); // Tuesday, Sydney time

function dayAt(daysAgo, hour = 6, minute = 30) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function paceSPerKm(km, seconds) {
  if (!km || !seconds) return null;
  return Math.round(seconds / km);
}

let stravaIdCounter = 9_900_000_000;
const nextStravaId = () => stravaIdCounter++;

// ---------- the activity plan (newest first) ----------
//
// Each row maps to one activity + (for runs) one debrief + one follow-up
// message + an activity_notes row, OR (for cross-training) one ack message.
//
// `rpe`: "unanswered" | "answered:<n>" | "skipped" | null (null = not eligible).
// `body` / `followUp` / `ack`: the prose. For runs, `body` is the debrief and
// `followUp` is the question. For cross-training, `ack` is the single
// acknowledgement paragraph.
const PLAN = [
  // ---- This week (most recent) ----
  {
    daysAgo: 0,
    hour: 6,
    minute: 35,
    type: "Run",
    name: "Tuesday easy",
    km: 8.1,
    seconds: 8 * 60 * 60 + 0, // computed below
    durationMin: 44,
    avgHr: 142,
    maxHr: 158,
    elev: 35,
    rpe: "unanswered",
    body:
      "Easy by pace, easy by HR — this is the shape Tuesdays are supposed to have, and it landed there cleanly the day after the long run.\n\n" +
      "142 average sits in the same easy band as the rest of the week's easy runs, so the legs are not paying interest yet on Sunday's 22km. That's the read worth keeping.",
    followUp: "How did the legs feel in the first kilometre versus the last?",
  },
  {
    daysAgo: 1,
    hour: 6,
    minute: 30,
    type: "Run",
    name: "Threshold 4×2km",
    km: 12.4,
    durationMin: 58,
    avgHr: 158,
    maxHr: 174,
    elev: 60,
    workout: true,
    rpe: "answered:7",
    body:
      "Four reps at threshold, and the shape held: 4:02, 4:04, 4:05, 4:08. The drift on rep four is small enough to read as honest fatigue rather than a session that came apart.\n\n" +
      "HR climbed two beats per rep across the set, which lines up with what the work-stress note from Friday would predict. The session got done at the cost it should cost — no need to read it as anything sharper than that.",
    followUp: "Was the last rep a discipline call or did the legs make it for you?",
  },
  {
    daysAgo: 2,
    hour: 7,
    minute: 0,
    type: "Run",
    name: "Sunday long",
    km: 22.0,
    durationMin: 119,
    avgHr: 149,
    maxHr: 162,
    elev: 145,
    rpe: "answered:6",
    body:
      "Solid long run that stayed inside the aerobic band the whole way through. 5:25/km with a 149 average is the long-run shape you've been settling into across this block.\n\n" +
      "The last 5km did not lift HR the way they sometimes do on a hot day, which says fuelling and pacing both lined up. Worth banking that as the reference point for the next two long runs.",
    followUp: "What did you take in across the run, fuelling-wise?",
  },
  {
    daysAgo: 3,
    hour: 8,
    minute: 0,
    type: "Ride",
    name: "Saturday spin",
    km: 35.2,
    durationMin: 92,
    avgHr: 128,
    maxHr: 148,
    elev: 280,
    ack: "Easy spin on the bike the day before the long run. Sensible shake-out shape.",
  },
  {
    daysAgo: 4,
    hour: 6,
    minute: 30,
    type: "Run",
    name: "Friday easy",
    km: 7.2,
    durationMin: 40,
    avgHr: 144,
    maxHr: 156,
    elev: 28,
    rpe: "skipped",
    body:
      "Easy seven on tired legs. Pace held at 5:35/km, HR sat where it usually does for easy. The work-stress note from earlier in the week is still in the picture, and you ran this one within yourself rather than against it.",
    followUp: null,
  },
  {
    daysAgo: 5,
    hour: 18,
    minute: 0,
    type: "Yoga",
    name: "Yoga flow",
    km: null,
    durationMin: 45,
    avgHr: 92,
    maxHr: 108,
    elev: null,
    ack: "45 of yoga in the evening. Good way to land the week before tomorrow's long.",
  },
  {
    daysAgo: 6,
    hour: 6,
    minute: 30,
    type: "Run",
    name: "Wednesday steady",
    km: 14.0,
    durationMin: 73,
    avgHr: 148,
    maxHr: 161,
    elev: 75,
    rpe: "answered:5",
    body:
      "Steady fourteen at the pace where aerobic ends and tempo begins. 5:13/km is a click quicker than your usual mid-week, and HR followed honestly — 148 is a fair price for that pace right now.\n\n" +
      "This sits inside the plan's progression: the mid-week is supposed to climb gently across the block, and it has. Nothing to interpret beyond that.",
    followUp: "Did you go in with a pace target or did it find itself?",
  },

  // ---- Last week ----
  {
    daysAgo: 7,
    hour: 6,
    minute: 30,
    type: "Run",
    name: "Tuesday easy",
    km: 8.0,
    durationMin: 44,
    avgHr: 141,
    maxHr: 154,
    elev: 30,
    rpe: "answered:3",
    body:
      "Easy run that held easy, day after the gym session. HR was a touch lower than last Tuesday's matching run, which lines up with the rest of the easy days settling.",
    followUp: null,
  },
  {
    daysAgo: 8,
    hour: 17,
    minute: 30,
    type: "WeightTraining",
    name: "Lower-body strength",
    km: null,
    durationMin: 60,
    avgHr: 112,
    maxHr: 138,
    elev: null,
    ack: "Tuesday gym, like clockwork. Day before the easy run, which is the right way around it.",
  },
  {
    daysAgo: 9,
    hour: 7,
    minute: 0,
    type: "Run",
    name: "Sunday long",
    km: 26.0,
    durationMin: 142,
    avgHr: 152,
    maxHr: 168,
    elev: 180,
    rpe: "answered:7",
    body:
      "Twenty-six kilometres at 5:28/km, HR averaging 152. That's the longest one of the block so far, and the HR drift is well-behaved — eight beats from first 5km to last 5km is what a clean long run looks like.\n\n" +
      "Sitting on the calf you mentioned ten days ago: no signs in the late-run pacing, no slowdown. Reads like that one's behind you.",
    followUp: "How was the calf at the 20km mark?",
  },
  {
    daysAgo: 10,
    hour: 6,
    minute: 30,
    type: "Run",
    name: "Saturday recovery",
    km: 6.1,
    durationMin: 36,
    avgHr: 138,
    maxHr: 150,
    elev: 18,
    rpe: "answered:4",
    body:
      "Recovery six the day before the long run. Pace and HR both stayed gentle, which is what this slot is for.",
    followUp: null,
  },
  {
    daysAgo: 11,
    hour: 8,
    minute: 0,
    type: "Ride",
    name: "Friday ride",
    km: 28.5,
    durationMin: 78,
    avgHr: 132,
    maxHr: 152,
    elev: 220,
    ack: "Bike on Friday, easy effort. Legs probably appreciated the no-impact day before tomorrow's recovery run.",
  },
  {
    daysAgo: 12,
    hour: 6,
    minute: 30,
    type: "Run",
    name: "Thursday steady",
    km: 12.0,
    durationMin: 64,
    avgHr: 147,
    maxHr: 158,
    elev: 60,
    rpe: "answered:5",
    body:
      "Twelve at 5:20/km, HR 147. That's the steady shape this block keeps coming back to. The mid-week is doing what it's supposed to do.",
    followUp: null,
  },
  {
    daysAgo: 13,
    hour: 6,
    minute: 30,
    type: "Run",
    name: "Wednesday easy",
    km: 8.2,
    durationMin: 45,
    avgHr: 142,
    maxHr: 155,
    elev: 32,
    rpe: "answered:3",
    body:
      "Easy eight, easy HR. The day after the threshold session, exactly the shape it should have.",
    followUp: null,
  },

  // ---- Two weeks ago ----
  {
    daysAgo: 14,
    hour: 6,
    minute: 30,
    type: "Run",
    name: "Tempo session",
    km: 11.0,
    durationMin: 53,
    avgHr: 159,
    maxHr: 172,
    elev: 50,
    workout: true,
    rpe: "answered:6",
    body:
      "Three kilometres at tempo inside an eleven-kilometre run, sandwiched the right way. Splits were 4:08, 4:10, 4:12 — small drift, clean shape.\n\n" +
      "First proper tempo since the calf eased off, and it held without protest. That's the answer the prior two weeks were asking.",
    followUp: "How did the calf hold up through the tempo block?",
  },
  {
    daysAgo: 15,
    hour: 18,
    minute: 30,
    type: "Yoga",
    name: "Recovery yoga",
    km: null,
    durationMin: 50,
    avgHr: 88,
    maxHr: 102,
    elev: null,
    ack: "50 of yoga the day before the tempo. Good landing-strip session.",
  },
  {
    daysAgo: 16,
    hour: 7,
    minute: 0,
    type: "Run",
    name: "Sunday long",
    km: 20.0,
    durationMin: 110,
    avgHr: 150,
    maxHr: 164,
    elev: 130,
    rpe: "answered:5",
    body:
      "Twenty at 5:30/km on the calf-aware easing-back-in long. HR sat where you'd want it, no late-run drift.\n\n" +
      "Reads like the body deciding the calf is done; the next long can step back up to the usual length.",
    followUp: null,
  },
  {
    daysAgo: 17,
    hour: 6,
    minute: 30,
    type: "Run",
    name: "Saturday easy",
    km: 6.0,
    durationMin: 36,
    avgHr: 140,
    maxHr: 152,
    elev: 22,
    rpe: "answered:3",
    body:
      "Easy six. Pace honest, HR gentle. The week's been a careful one and this fits inside that.",
    followUp: null,
  },
  {
    daysAgo: 18,
    hour: 17,
    minute: 0,
    type: "WeightTraining",
    name: "Strength session",
    km: null,
    durationMin: 55,
    avgHr: 118,
    maxHr: 142,
    elev: null,
    ack: "Friday gym. The strength side of the picture is showing up consistently this block.",
  },
  {
    daysAgo: 19,
    hour: 6,
    minute: 30,
    type: "Run",
    name: "Thursday easy",
    km: 9.0,
    durationMin: 49,
    avgHr: 143,
    maxHr: 156,
    elev: 38,
    rpe: "answered:4",
    body:
      "Nine kilometres easy, calf in mind. HR sat in the easy band the whole way; nothing to read into beyond that.",
    followUp: null,
  },
  {
    daysAgo: 20,
    hour: 6,
    minute: 30,
    type: "Run",
    name: "Wednesday steady",
    km: 13.0,
    durationMin: 70,
    avgHr: 148,
    maxHr: 160,
    elev: 65,
    rpe: "answered:5",
    body:
      "Thirteen steady. The pace is where it should be, the HR is where it should be, the calf hasn't said anything for several runs running. Good week to start opening up the workouts again.",
    followUp: null,
  },
];

// ---------- main ----------
async function main() {
  // Resolve athlete.
  const { data: athletes, error: athleteErr } = await admin
    .from("athletes")
    .select("id, email, display_name")
    .eq("email", ATHLETE_EMAIL)
    .limit(1);
  if (athleteErr) throw athleteErr;
  if (!athletes || athletes.length === 0) {
    throw new Error(`No athlete found for ${ATHLETE_EMAIL}`);
  }
  const athlete = athletes[0];
  console.log(`→ Athlete ${athlete.id} (${athlete.email})`);

  // Wipe.
  console.log("→ Wiping activities, messages, activity_notes, memory_items…");
  await admin.from("activity_notes").delete().eq("athlete_id", athlete.id);
  await admin.from("messages").delete().eq("athlete_id", athlete.id);
  await admin.from("activities").delete().eq("athlete_id", athlete.id);
  await admin.from("memory_items").delete().eq("athlete_id", athlete.id);

  // Ensure thread.
  const { data: threadRow, error: threadErr } = await admin.rpc("ensure_thread", {
    p_athlete_id: athlete.id,
  });
  if (threadErr) throw threadErr;
  const threadId = typeof threadRow === "string" ? threadRow : threadRow?.id ?? threadRow;
  console.log(`→ Thread ${threadId}`);

  // Goal race — clear any active rows, insert one.
  console.log("→ Setting goal race (Sydney Marathon)…");
  await admin
    .from("goal_races")
    .update({ is_active: false })
    .eq("athlete_id", athlete.id)
    .eq("is_active", true);
  await admin.from("goal_races").insert({
    athlete_id: athlete.id,
    name: "Sydney Marathon",
    race_date: "2026-09-06",
    goal_time_seconds: 3 * 3600 + 15 * 60, // sub-3:15
    is_active: true,
  });

  // Memory items.
  console.log("→ Seeding memory items…");
  await admin.from("memory_items").insert([
    {
      athlete_id: athlete.id,
      kind: "injury",
      content: "Right calf tight, easing back into longer efforts",
      tags: ["calf"],
      source: "chat",
      created_at: dayAt(10, 19, 30).toISOString(),
    },
    {
      athlete_id: athlete.id,
      kind: "context",
      content: "Sleep has been rough this week, big work deadlines",
      tags: ["sleep", "work"],
      source: "chat",
      created_at: dayAt(4, 21, 0).toISOString(),
    },
  ]);

  // Iterate plan oldest-first so created_at increases monotonically and the
  // thread reads correctly.
  const ordered = [...PLAN].sort((a, b) => b.daysAgo - a.daysAgo);

  console.log(`→ Seeding ${ordered.length} activities + messages…`);
  for (const row of ordered) {
    await seedRow(athlete.id, threadId, row);
  }

  console.log("✓ Done.");
}

async function seedRow(athleteId, threadId, row) {
  const startDate = dayAt(row.daysAgo, row.hour, row.minute);
  const movingTimeS = Math.round(row.durationMin * 60);
  const distanceM = row.km != null ? Math.round(row.km * 1000) : null;
  const pace = paceSPerKm(row.km, movingTimeS);
  const stravaId = nextStravaId();

  // Activity row.
  const { data: activityRow, error: activityErr } = await admin
    .from("activities")
    .insert({
      athlete_id: athleteId,
      strava_id: stravaId,
      start_date_local: startDate.toISOString(),
      name: row.name,
      activity_type: row.type,
      distance_m: distanceM,
      moving_time_s: movingTimeS,
      avg_pace_s_per_km: pace,
      avg_hr: row.avgHr,
      max_hr: row.maxHr,
      elevation_gain_m: row.elev,
      raw: { seeded: true },
    })
    .select("id")
    .single();
  if (activityErr) throw activityErr;
  const activityId = activityRow.id;

  const debriefCreatedAt = new Date(
    startDate.getTime() + (movingTimeS + 25 * 60) * 1000,
  );

  if (/run/i.test(row.type)) {
    // Debrief message.
    const { data: debrief, error: debriefErr } = await admin
      .from("messages")
      .insert({
        thread_id: threadId,
        athlete_id: athleteId,
        kind: "debrief",
        body: row.body,
        meta: {
          activity_id: activityId,
          activity_date: startDate.toISOString(),
          strava_id: stravaId,
          activity_type: row.type,
          distance_km: row.km,
          moving_time_s: movingTimeS,
          avg_hr: row.avgHr,
        },
        created_at: debriefCreatedAt.toISOString(),
      })
      .select("id")
      .single();
    if (debriefErr) throw debriefErr;

    // Optional follow-up.
    if (row.followUp) {
      const followUpAt = new Date(debriefCreatedAt.getTime() + 5 * 1000);
      const { error: followErr } = await admin.from("messages").insert({
        thread_id: threadId,
        athlete_id: athleteId,
        kind: "follow_up",
        body: row.followUp,
        meta: { activity_id: activityId, parent_id: debrief.id },
        created_at: followUpAt.toISOString(),
      });
      if (followErr) throw followErr;
    }

    // RPE / activity_notes.
    if (row.rpe) {
      const promptedAt = new Date(debriefCreatedAt.getTime() + 30 * 1000);
      const note = {
        activity_id: activityId,
        athlete_id: athleteId,
        bucket: /run/i.test(row.type) ? "run" : "xtrain",
        rpe_prompted_at: promptedAt.toISOString(),
      };
      if (row.rpe === "skipped") {
        note.rpe_skipped_at = new Date(
          promptedAt.getTime() + 60 * 1000,
        ).toISOString();
      } else if (row.rpe.startsWith("answered:")) {
        const value = Number(row.rpe.slice("answered:".length));
        note.rpe_value = value;
        note.rpe_answered_at = new Date(
          promptedAt.getTime() + 90 * 1000,
        ).toISOString();
      }
      // "unanswered" → no answered/skipped fields, picker will render the
      // prompt.
      const { error: noteErr } = await admin.from("activity_notes").insert(note);
      if (noteErr) throw noteErr;
    }
  } else {
    // Cross-training acknowledgement.
    const { error: ackErr } = await admin.from("messages").insert({
      thread_id: threadId,
      athlete_id: athleteId,
      kind: "cross_training_ack",
      body: row.ack,
      meta: {
        activity_id: activityId,
        activity_type: row.type,
        activity_date: startDate.toISOString(),
        is_pattern: false,
        pattern_description: null,
        is_substitution: false,
        strava_id: stravaId,
        distance_km: row.km,
        moving_time_s: movingTimeS,
        avg_hr: row.avgHr,
      },
      created_at: debriefCreatedAt.toISOString(),
    });
    if (ackErr) throw ackErr;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
