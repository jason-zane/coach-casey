import assert from "node:assert/strict";
import test from "node:test";
import {
  claimStravaAthleteId,
  type StravaConnectionsAdmin,
} from "../lib/strava/connections.ts";

type DeleteOutcome = {
  data: { athlete_id: string }[] | null;
  error: { message: string } | null;
};

/**
 * Chainable fake for the one query shape the claim helper issues:
 * delete().eq("strava_athlete_id", ...).neq("athlete_id", ...).select(...).
 * Records the filters so tests can assert the delete is scoped correctly.
 */
function fakeAdmin(outcome: DeleteOutcome) {
  const calls: {
    table?: string;
    eq?: [string, number];
    neq?: [string, string];
    select?: string;
  } = {};
  const admin: StravaConnectionsAdmin = {
    from(table) {
      calls.table = table;
      return {
        delete() {
          return {
            eq(column, value) {
              calls.eq = [column, value];
              return {
                neq(column2, value2) {
                  calls.neq = [column2, value2];
                  return {
                    select(columns) {
                      calls.select = columns;
                      return Promise.resolve(outcome);
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { admin, calls };
}

test("claim is a no-op when the Strava athlete id is unknown", async () => {
  const { admin, calls } = fakeAdmin({ data: [], error: null });
  assert.deepEqual(
    await claimStravaAthleteId(admin, { athleteId: "a1", stravaAthleteId: null }),
    [],
  );
  assert.deepEqual(
    await claimStravaAthleteId(admin, {
      athleteId: "a1",
      stravaAthleteId: undefined,
    }),
    [],
  );
  // The client must never be touched: NULL rows sit outside the unique
  // index and are healed later by ingest.
  assert.equal(calls.table, undefined);
});

test("claim deletes only other athletes' rows for that Strava account", async () => {
  const { admin, calls } = fakeAdmin({
    data: [{ athlete_id: "older-athlete" }],
    error: null,
  });
  const displaced = await claimStravaAthleteId(admin, {
    athleteId: "winner",
    stravaAthleteId: 456,
  });
  assert.deepEqual(displaced, ["older-athlete"]);
  assert.equal(calls.table, "strava_connections");
  assert.deepEqual(calls.eq, ["strava_athlete_id", 456]);
  // Scoped away from the claiming athlete so a same-account re-connect
  // never deletes its own row.
  assert.deepEqual(calls.neq, ["athlete_id", "winner"]);
  assert.equal(calls.select, "athlete_id");
});

test("claim returns empty when nobody else held the account", async () => {
  const { admin } = fakeAdmin({ data: [], error: null });
  assert.deepEqual(
    await claimStravaAthleteId(admin, { athleteId: "a1", stravaAthleteId: 456 }),
    [],
  );
});

test("claim surfaces delete errors instead of swallowing them", async () => {
  const { admin } = fakeAdmin({ data: null, error: { message: "boom" } });
  await assert.rejects(
    claimStravaAthleteId(admin, { athleteId: "a1", stravaAthleteId: 456 }),
    (err: unknown) => (err as { message: string }).message === "boom",
  );
});
