import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSigningKeys } from "@/lib/auth/jwks";

/**
 * Per-request memoised lookup of the current Supabase user + the matching
 * `athletes` row. `cache()` from React dedups invocations within a single
 * request (layout + page + server action all share one round trip).
 *
 * Identity is read with `getClaims()`, which verifies the access token's
 * ES256 signature locally against the project's cached JWKS (see
 * `lib/auth/jwks.ts`) instead of the network round trip `getUser()` makes on
 * every call. The middleware/proxy (lib/supabase/middleware.ts) still calls
 * `getUser()` once per request to revalidate and refresh the session against
 * the Auth server, so the security gate is unchanged; the page just reads the
 * already-validated identity rather than re-validating it. If the project ever
 * isn't on an asymmetric signing key, `getClaims()` transparently falls back
 * to a server round trip, so this stays correct either way.
 */

export type CurrentUser = {
  id: string;
  email: string | null;
};

export type CurrentAthlete = {
  id: string;
  deleted_at: string | null;
  onboarding_completed_at: string | null;
  date_of_birth: string | null;
  display_name: string | null;
  email: string | null;
  /** Athlete-row creation time; the "joined Coach Casey" date for hero copy. */
  created_at: string;
};

export type CurrentSession = {
  user: CurrentUser;
  athlete: CurrentAthlete | null;
};

export const getCurrentSession = cache(async (): Promise<CurrentSession | null> => {
  const supabase = await createClient();

  const keys = await getSigningKeys();
  const { data, error } = await supabase.auth.getClaims(
    undefined,
    keys.length ? { jwks: { keys } } : undefined,
  );
  const claims = data?.claims;
  if (error || !claims?.sub) return null;

  const { data: athlete } = await supabase
    .from("athletes")
    .select(
      "id, deleted_at, onboarding_completed_at, date_of_birth, display_name, email, created_at",
    )
    .eq("user_id", claims.sub)
    .maybeSingle<CurrentAthlete>();

  return {
    user: { id: claims.sub, email: claims.email ?? null },
    athlete: athlete ?? null,
  };
});
