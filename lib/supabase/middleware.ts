import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolveAthleteRoute } from "@/lib/onboarding/routing";

/** Comma-separated ADMIN_EMAILS, normalised to a lowercase list. */
function adminAllowlist(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

/**
 * Refreshes the Supabase session on every request and enforces routing gates:
 *   - Unauthed on /app or /onboarding   → /signin
 *   - Unauthed on /admin (not /admin/login) → /admin/login
 *   - Authed non-admin on /admin/*      → /admin/login?error=forbidden
 *   - Authed admin on /admin/login      → /admin
 *   - Athlete routing gates: see resolveAthleteRoute() in
 *     lib/onboarding/routing.ts (signin/signup bounce, onboarding gate,
 *     DOB backfill hold, forward-jump gate)
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not put code between createServerClient() and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const onProtected =
    pathname.startsWith("/app") || pathname.startsWith("/onboarding");
  const onAdminConsole =
    pathname === "/admin" || pathname.startsWith("/admin/");
  const onAdminLogin = pathname === "/admin/login";
  const onAdminProtected = onAdminConsole && !onAdminLogin;

  if (!user) {
    if (onProtected) {
      const url = request.nextUrl.clone();
      url.pathname = "/signin";
      return NextResponse.redirect(url);
    }
    if (onAdminProtected) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Authed from here on. Look up the athlete row once per request: it carries
  // onboarding state (for the gates below) and the soft-delete marker.
  // date_of_birth is included so the DOB backfill redirect (athletes who
  // completed onboarding before the about-you step existed) can run here
  // instead of inside (app)/layout.tsx, which lets that layout stay sync and
  // lets /app statically prerender for SW caching. A pure admin with no
  // athlete row gets null here and skips every athlete-keyed branch.
  const { data: athlete } = await supabase
    .from("athletes")
    .select(
      "onboarding_current_step, onboarding_completed_at, date_of_birth, deleted_at, signup_authorized_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  // Soft-deleted accounts lose access immediately — and that includes the
  // admin console: this check runs before the /admin gate, so an admin whose
  // own athlete account is mid-purge can't keep loading the console either.
  // requireAthlete enforces the same on server actions; mirroring it here
  // means a still-valid session can't keep loading protected pages during the
  // 30-day purge window.
  if (athlete?.deleted_at) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "deleted=1";
    const redirectResponse = NextResponse.redirect(url);
    for (const cookie of supabaseResponse.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    return redirectResponse;
  }

  // Invite gate (see lib/auth/invite.ts). While signups are closed, an
  // athlete row without signup_authorized_at means the account was minted
  // around the gate — Google OAuth, or GoTrue's self-serve endpoints called
  // directly with the public anon key. /auth/callback deletes such accounts
  // when it sees them; this catches sessions that skipped the callback
  // (e.g. tokens obtained straight from the Auth API), on every matched
  // request including /api routes. OPEN_SIGNUP is read inline to keep the
  // server-only invite module out of the proxy, like adminAllowlist below.
  if (
    athlete &&
    !athlete.signup_authorized_at &&
    process.env.OPEN_SIGNUP !== "true"
  ) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.search = "error=invite_required";
    const redirectResponse = NextResponse.redirect(url);
    for (const cookie of supabaseResponse.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    return redirectResponse;
  }

  // Admin console gate. Keyed on the email allowlist and resolved here,
  // independently of onboarding state — an admin needn't be an athlete, and
  // must never be bounced into the onboarding flow. Returns for every /admin
  // path so the athlete logic below only ever sees app routes.
  if (onAdminConsole) {
    const admins = adminAllowlist();
    const email = user.email?.toLowerCase() ?? "";
    const isAdmin = email.length > 0 && admins.includes(email);
    if (onAdminLogin) {
      if (isAdmin) {
        const url = request.nextUrl.clone();
        url.pathname = "/admin";
        url.search = "";
        return NextResponse.redirect(url);
      }
      return supabaseResponse;
    }
    if (!isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = "";
      url.searchParams.set("error", "forbidden");
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  const decision = resolveAthleteRoute({
    pathname,
    searchParams: request.nextUrl.searchParams,
    onboardingComplete: Boolean(athlete?.onboarding_completed_at),
    currentStep: athlete?.onboarding_current_step ?? "strava",
    hasDateOfBirth: Boolean(athlete?.date_of_birth),
    userAgent: request.headers.get("user-agent"),
  });
  if (decision) {
    const url = request.nextUrl.clone();
    url.pathname = decision.pathname;
    url.search = decision.search ? `?${decision.search}` : "";
    return NextResponse.redirect(url);
  }

  // Admin gate. requireAdmin() in each admin page is the real check, but it
  // runs inside page.tsx, so the route-level loading.tsx would stream the
  // admin shell, confirming the surface exists and revealing its structure,
  // to any signed-in non-admin who hits the URL before that redirect fires.
  // Gate here so non-admins never reach the admin route renderer at all,
  // preserving requireAdmin's "don't even confirm the route exists" intent.
  // Mirrors isAdminEmail() in lib/admin/auth.ts; inlined to keep that
  // server-only module (and its Supabase client import) out of the proxy.
  if (pathname.startsWith("/app/admin")) {
    const admins = adminAllowlist();
    const email = user.email?.toLowerCase() ?? "";
    if (!email || admins.length === 0 || !admins.includes(email)) {
      const url = request.nextUrl.clone();
      url.pathname = "/app";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
