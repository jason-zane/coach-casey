import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Per-request memoised lookup of the current Supabase user + the matching
 * `athletes` row. `cache()` from React dedups invocations within a single
 * request (layout + page + server action all share one round trip).
 *
 * The middleware does its own getUser/athletes lookup against a different
 * Supabase client (request-scoped cookies, separate from the server-component
 * client), so it doesn't share this cache. That's fine, the layout + page
 * dedup is where most of the duplication lived.
 */

export type CurrentAthlete = {
  id: string;
  deleted_at: string | null;
  onboarding_completed_at: string | null;
  date_of_birth: string | null;
  display_name: string | null;
  email: string | null;
};

export type CurrentSession = {
  user: User;
  athlete: CurrentAthlete | null;
};

export const getCurrentSession = cache(async (): Promise<CurrentSession | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("athletes")
    .select(
      "id, deleted_at, onboarding_completed_at, date_of_birth, display_name, email",
    )
    .eq("user_id", user.id)
    .maybeSingle<CurrentAthlete>();

  return { user, athlete: data ?? null };
});
