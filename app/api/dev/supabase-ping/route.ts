import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const serverClient = await createClient();
  const { data: authData, error: authError } = await serverClient.auth.getSession();

  const adminClient = createAdminClient();
  const { data: buckets, error: bucketsError } = await adminClient.storage.listBuckets();

  return NextResponse.json({
    server_client: {
      ok: !authError,
      session: authData?.session ?? null,
      error: authError?.message ?? null,
    },
    admin_client: {
      ok: !bucketsError,
      buckets: buckets?.map((b) => b.name) ?? [],
      error: bucketsError?.message ?? null,
    },
  });
}
