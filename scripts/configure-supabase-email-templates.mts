// Push the cross-device auth email templates (magic link + signup confirmation)
// to the hosted Coach Casey project, so the passwordless sign-in / sign-up
// emails link via token_hash (server-verified, works cross-device) and lead
// with a 6-digit code for same-tab entry — see supabase/templates/*.html and
// app/auth/callback/route.ts.
//
//   SUPABASE_ACCESS_TOKEN=sbp_xxx pnpm email:configure        apply
//   SUPABASE_ACCESS_TOKEN=sbp_xxx pnpm email:configure:dry    show, send nothing
//
// This is a TARGETED PATCH of only the email-template fields on the linked
// project's auth config. Like scripts/configure-supabase-smtp.mts, it
// deliberately does NOT use `supabase config push`, which has no scoping and
// would also overwrite production site_url / redirect URLs from the local-dev
// values in supabase/config.toml.
//
// Required:
//   SUPABASE_ACCESS_TOKEN  personal access token, create at
//                          https://supabase.com/dashboard/account/tokens
//                          Resolved from env or .env.local. Never printed.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Coach Casey App project (Tokyo) — backs both production and preview.
const PROJECT_REF = "wwxfyigcshxhlibawgwp";

function templateBody(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../supabase/templates/${name}`, import.meta.url)),
    "utf8",
  );
}

const body = {
  mailer_subjects_magic_link: "Your Coach Casey sign-in link",
  mailer_templates_magic_link_content: templateBody("magic-link.html"),
  mailer_subjects_confirmation: "Confirm your Coach Casey account",
  mailer_templates_confirmation_content: templateBody("confirm-signup.html"),
} as const;

function fromEnvFile(path: string, key: string): string | undefined {
  if (!existsSync(path)) return undefined;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, "").trim();
  }
  return undefined;
}

function resolve(key: string): string | undefined {
  return (
    process.env[key] ||
    fromEnvFile(".env.local", key) ||
    fromEnvFile(".env.production.local", key) ||
    undefined
  );
}

const dryRun = process.argv.includes("--dry-run");

console.log(`Project: ${PROJECT_REF}`);
console.log("Email templates to apply:");
console.log({
  magic_link_subject: body.mailer_subjects_magic_link,
  magic_link_chars: body.mailer_templates_magic_link_content.length,
  confirmation_subject: body.mailer_subjects_confirmation,
  confirmation_chars: body.mailer_templates_confirmation_content.length,
});

if (dryRun) {
  console.log("\n--dry-run: nothing sent.");
  process.exit(0);
}

const token = resolve("SUPABASE_ACCESS_TOKEN");
if (!token) {
  console.error(
    "missing SUPABASE_ACCESS_TOKEN. Create one at " +
      "https://supabase.com/dashboard/account/tokens, then pass it inline " +
      "(SUPABASE_ACCESS_TOKEN=sbp_xxx pnpm email:configure) or add it to .env.local",
  );
  process.exit(1);
}

const res = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`,
  {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  },
);

const text = await res.text();
if (!res.ok) {
  console.error(`\nPATCH failed: ${res.status}\n${text}`);
  process.exit(1);
}

let parsed: Record<string, unknown> = {};
try {
  parsed = JSON.parse(text);
} catch {
  /* non-JSON response; ignore */
}

console.log("\n✓ Email templates updated. Current subjects on the project:");
console.log({
  mailer_subjects_magic_link: parsed.mailer_subjects_magic_link,
  mailer_subjects_confirmation: parsed.mailer_subjects_confirmation,
});
console.log(
  "\nConfirm: request a sign-in code from /signin and check the email leads " +
    "with a 6-digit code and a token_hash link to /auth/callback.",
);
