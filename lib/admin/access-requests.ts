import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

export type AccessRequestStatus = "pending" | "invited" | "joined" | "declined";

export type AccessRequest = {
  id: string;
  name: string | null;
  email: string;
  note: string | null;
  status: AccessRequestStatus;
  createdAt: string;
  handledAt: string | null;
};

type Row = {
  id: string;
  name: string | null;
  email: string;
  note: string | null;
  status: AccessRequestStatus;
  created_at: string;
  handled_at: string | null;
};

/**
 * All early-access requests, newest first. Service-role read behind the
 * ADMIN_EMAILS gate (the table is RLS-locked to the service role). Resilient:
 * returns an empty list if the table is missing or the query errors, so the
 * admin page renders rather than 500s.
 */
export async function listAccessRequests(): Promise<AccessRequest[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("access_requests")
      .select("id, name, email, note, status, created_at, handled_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error || !data) return [];
    return (data as Row[]).map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      note: r.note,
      status: r.status,
      createdAt: r.created_at,
      handledAt: r.handled_at,
    }));
  } catch {
    return [];
  }
}
