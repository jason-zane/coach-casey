import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Guards the auth email templates against the regression that locked out our
// first real signup: a magic link must NEVER use the default PKCE
// `{{ .ConfirmationURL }}` (browser-bound `?code=`, fails cross-device). It must
// link to /auth/callback with a server-verified `token_hash`, and carry a
// 6-digit `{{ .Token }}` code for the same-tab code-entry flow. See
// app/auth/callback/route.ts and app/(app)/_components/code-entry-form.tsx.
function template(name: string): string {
  const raw = readFileSync(
    fileURLToPath(new URL(`../supabase/templates/${name}`, import.meta.url)),
    "utf8",
  );
  // Assert on the active markup only — strip HTML comments so an explanatory
  // note mentioning a forbidden token doesn't trip the guard (and Go's
  // text/template would evaluate a mustache even inside a comment anyway).
  return raw.replace(/<!--[\s\S]*?-->/g, "");
}

const CASES = [
  { file: "magic-link.html", type: "magiclink" },
  { file: "confirm-signup.html", type: "signup" },
] as const;

for (const { file, type } of CASES) {
  test(`${file} uses the cross-device token_hash flow, not PKCE code`, () => {
    const html = template(file);
    assert.ok(
      !html.includes("{{ .ConfirmationURL }}"),
      `${file} must not use {{ .ConfirmationURL }} (PKCE ?code=, fails cross-device)`,
    );
    assert.ok(
      html.includes("{{ .TokenHash }}"),
      `${file} must link via {{ .TokenHash }} for server-side verifyOtp`,
    );
    assert.ok(
      html.includes("{{ .RedirectTo }}"),
      `${file} must build its link from {{ .RedirectTo }} (the server-set /auth/callback URL carrying next)`,
    );
    assert.ok(
      html.includes(`type=${type}`),
      `${file} link must declare type=${type} so the callback verifies it correctly`,
    );
  });

  test(`${file} includes a {{ .Token }} code for same-tab entry`, () => {
    assert.ok(
      template(file).includes("{{ .Token }}"),
      `${file} must include the 6-digit {{ .Token }} code for the code-entry flow`,
    );
  });
}
