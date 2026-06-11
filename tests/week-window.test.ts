import assert from "node:assert/strict";
import test from "node:test";
import {
  computeCurrentWeek,
  computePreviousFullWeek,
  computeReviewWeek,
  localHour,
  localWeekdayMondayZero,
  weeklyReviewSlot,
} from "../lib/thread/week-window.ts";

// Pins the weekly-review timing contract: the cron fires hourly at :00
// UTC, and per athlete the gate opens Sunday 18:00-20:59 local (default)
// or Monday 07:00-10:59 local (weekly_review_day = 1). The fixed dates
// below are a real week: 2026-06-08 is a Monday, 2026-06-14 a Sunday.
// June avoids DST edges in both hemispheres for the zones used (Sydney
// is AEST UTC+10, Los Angeles is PDT UTC-7).

const WEEK = { weekStartIso: "2026-06-08", weekEndIso: "2026-06-14" };

test("Sydney athlete becomes eligible exactly at the 08:00-10:00 UTC Sunday fires", () => {
  const tz = "Australia/Sydney"; // UTC+10 in June
  // 17:59 local, one minute before the window opens.
  assert.equal(weeklyReviewSlot(0, tz, new Date("2026-06-14T07:59:00Z")), null);
  // The three hourly cron fires that land inside 18:00-20:59 local.
  for (const utcHour of ["08", "09", "10"]) {
    const slot = weeklyReviewSlot(
      0,
      tz,
      new Date(`2026-06-14T${utcHour}:00:00Z`),
    );
    assert.deepEqual(slot, WEEK, `expected eligibility at ${utcHour}:00Z`);
  }
  // 20:59 local is still inside; 21:00 local is not.
  assert.deepEqual(weeklyReviewSlot(0, tz, new Date("2026-06-14T10:59:00Z")), WEEK);
  assert.equal(weeklyReviewSlot(0, tz, new Date("2026-06-14T11:00:00Z")), null);
  // Right hour, wrong day: Saturday evening local stays closed.
  assert.equal(weeklyReviewSlot(0, tz, new Date("2026-06-13T08:00:00Z")), null);
});

test("repeated hourly fires inside the window resolve to one idempotency key", () => {
  // The DB guard is keyed on weekStartIso; the pure-function half of
  // "hourly re-fires don't double-send" is that every in-window fire
  // computes the same key.
  const keys = new Set(
    ["08:00", "09:00", "10:00", "10:59"].map(
      (t) =>
        weeklyReviewSlot(
          0,
          "Australia/Sydney",
          new Date(`2026-06-14T${t}:00Z`),
        )?.weekStartIso,
    ),
  );
  assert.deepEqual([...keys], ["2026-06-08"]);
});

test("Sunday evening west of Greenwich is Monday in UTC and still gates correctly", () => {
  const tz = "America/Los_Angeles"; // UTC-7 in June
  const at = new Date("2026-06-15T01:30:00Z"); // Sunday 18:30 local
  assert.equal(localWeekdayMondayZero(tz, at), 6);
  assert.equal(localHour(tz, at), 18);
  assert.deepEqual(weeklyReviewSlot(0, tz, at), WEEK);
});

test("the Sunday send covers the current week, Monday through that Sunday", () => {
  const sundayEvening = new Date("2026-06-14T08:00:00Z"); // Sydney 18:00
  assert.deepEqual(computeCurrentWeek("Australia/Sydney", sundayEvening), WEEK);
  // computePreviousFullWeek on the same instant points one week back,
  // which is why the cron's Sunday path must not use it.
  assert.deepEqual(computePreviousFullWeek("Australia/Sydney", sundayEvening), {
    weekStartIso: "2026-06-01",
    weekEndIso: "2026-06-07",
  });
});

test("weekly_review_day = 1 keeps the Monday morning window over the same week", () => {
  const tz = "Australia/Sydney";
  const mondayMorning = new Date("2026-06-14T22:00:00Z"); // Monday 08:00 local
  // Same calendar week, same idempotency key as the Sunday send.
  assert.deepEqual(weeklyReviewSlot(1, tz, mondayMorning), WEEK);
  // A Monday-preference athlete is not eligible during the Sunday window,
  // and a Sunday-preference athlete is not eligible Monday morning.
  assert.equal(weeklyReviewSlot(1, tz, new Date("2026-06-14T08:00:00Z")), null);
  assert.equal(weeklyReviewSlot(0, tz, mondayMorning), null);
  // Monday window bounds: 06:59 closed, 07:00 open, 11:00 closed.
  assert.equal(weeklyReviewSlot(1, tz, new Date("2026-06-14T20:59:00Z")), null);
  assert.deepEqual(weeklyReviewSlot(1, tz, new Date("2026-06-14T21:00:00Z")), WEEK);
  assert.equal(weeklyReviewSlot(1, tz, new Date("2026-06-15T01:00:00Z")), null);
});

test("unrecognised or missing weekly_review_day falls back to the Sunday default", () => {
  const at = new Date("2026-06-14T08:00:00Z");
  for (const day of [null, undefined, 0, 3, 6]) {
    assert.deepEqual(weeklyReviewSlot(day, "Australia/Sydney", at), WEEK);
  }
});

test("null timezone falls back to UTC", () => {
  const at = new Date("2026-06-14T19:00:00Z"); // Sunday 19:00 UTC
  assert.equal(localHour(null, at), 19);
  assert.equal(localWeekdayMondayZero(null, at), 6);
  assert.deepEqual(weeklyReviewSlot(0, null, at), WEEK);
});

test("computeCurrentWeek mid-week is a partial week ending today", () => {
  // The cron only calls it inside the Sunday gate; this documents the
  // shape rather than blesses a mid-week send.
  assert.deepEqual(computeCurrentWeek(null, new Date("2026-06-10T12:00:00Z")), {
    weekStartIso: "2026-06-08",
    weekEndIso: "2026-06-10",
  });
});

test("computeReviewWeek gives the same week on Sunday evening and the Monday after", () => {
  // The admin button and dev route default to computeReviewWeek; an
  // athlete seeded manually on Monday must not get a different week than
  // the cron sent the evening before.
  const sunday = computeReviewWeek("Australia/Sydney", new Date("2026-06-14T08:00:00Z"));
  const monday = computeReviewWeek("Australia/Sydney", new Date("2026-06-14T22:00:00Z"));
  const thursday = computeReviewWeek("Australia/Sydney", new Date("2026-06-18T03:00:00Z"));
  assert.deepEqual(sunday, WEEK);
  assert.deepEqual(monday, WEEK);
  assert.deepEqual(thursday, WEEK);
});
