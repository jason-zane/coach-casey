// Dev debug — list recent memory_items for an athlete email.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const envText = readFileSync(".env.local", "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = process.argv[2] ?? "test-bridge@example.com";
const { data: a } = await admin.from("athletes").select("id").eq("email", email).single();
const { data } = await admin
  .from("memory_items")
  .select("kind, content, tags, source, created_at")
  .eq("athlete_id", a.id)
  .order("created_at", { ascending: false })
  .limit(10);
console.log(JSON.stringify(data, null, 2));
