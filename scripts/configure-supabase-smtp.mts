// Point Supabase Auth at Resend SMTP, so transactional auth emails (the
// passwordless sign-in / sign-up magic link, plus email change) send from
// hello@coachcasey.app on the verified coachcasey.app domain.
//
//   SUPABASE_ACCESS_TOKEN=sbp_xxx pnpm smtp:configure        apply
//   SUPABASE_ACCESS_TOKEN=sbp_xxx pnpm smtp:configure:dry    show, send nothing
//
// This is a TARGETED PATCH of only the SMTP fields on the linked project's auth
// config. It deliberately does NOT use `supabase config push`, which has no
// scoping and would also overwrite production site_url / redirect URLs from the
// local-dev values in supabase/config.toml.
//
// Required:
//   SUPABASE_ACCESS_TOKEN  personal access token, create at
//                          https://supabase.com/dashboard/account/tokens
//                          Resolved from env or .env.local. Never printed.
//   RESEND_API_KEY         send-scoped Resend key — doubles as the SMTP
//                          password. Resolved from env or .env.local. Never
//                          printed (only a length-masked preview).

import { existsSync, readFileSync } from "node:fs";

// Coach Casey App project (Tokyo). This single project backs both production
// and preview app deployments, so configuring SMTP here covers both.
const PROJECT_REF = "wwxfyigcshxhlibawgwp";

const SMTP = {
  smtp_host: "smtp.resend.com",
  smtp_port: "465",
  smtp_user: "resend",
  smtp_admin_email: "hello@coachcasey.app",
  smtp_sender_name: "Coach Casey",
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

const resendKey = resolve("RESEND_API_KEY");
if (!resendKey) {
  console.error("missing RESEND_API_KEY (env or .env.local)");
  process.exit(1);
}

const body = { ...SMTP, smtp_pass: resendKey };

console.log(`Project: ${PROJECT_REF}`);
console.log("SMTP config to apply:");
console.log({
  ...body,
  smtp_pass: `${resendKey.slice(0, 4)}…(${resendKey.length} chars)`,
});

// --dry-run needs no Supabase token: it only previews the body, nothing sent.
if (dryRun) {
  console.log("\n--dry-run: nothing sent.");
  process.exit(0);
}

const token = resolve("SUPABASE_ACCESS_TOKEN");
if (!token) {
  console.error(
    "missing SUPABASE_ACCESS_TOKEN. Create one at " +
      "https://supabase.com/dashboard/account/tokens, then pass it inline " +
      "(SUPABASE_ACCESS_TOKEN=sbp_xxx pnpm smtp:configure) or add it to .env.local",
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

// Supabase masks smtp_pass in the response; echo back the visible fields.
let parsed: Record<string, unknown> = {};
try {
  parsed = JSON.parse(text);
} catch {
  /* non-JSON response; ignore */
}

console.log("\n✓ SMTP updated. Current auth SMTP fields on the project:");
console.log({
  smtp_host: parsed.smtp_host,
  smtp_port: parsed.smtp_port,
  smtp_user: parsed.smtp_user,
  smtp_admin_email: parsed.smtp_admin_email,
  smtp_sender_name: parsed.smtp_sender_name,
});
console.log(
  "\nConfirm delivery: request a sign-in magic link (or hit the dev send-test " +
    "route) and check the email arrives DKIM-signed from coachcasey.app.",
);
