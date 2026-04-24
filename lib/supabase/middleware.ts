import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session on every request and enforces routing gates:
 *   - Unauthed on /app or /onboarding   → /signin
 *   - Authed on /signin or /signup      → /app (onboarding gate below may redirect)
 *   - Authed + onboarding incomplete on /app → /onboarding
 *   - Authed + onboarding complete on /onboarding → /app
 *   - Authed + onboarding incomplete on exact /onboarding → /onboarding/{currentStep}
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

  if (onProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    return NextResponse.redirect(url);
  }

  if (!user) return supabaseResponse;

  // Authed from here on. Look up onboarding state once per request.
  const { data: athlete } = await supabase
    .from("athletes")
    .select("onboarding_current_step, onboarding_completed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const onboardingComplete = Boolean(athlete?.onboarding_completed_at);
  const currentStep = athlete?.onboarding_current_step ?? "strava";

  if (pathname === "/signin" || pathname === "/signup") {
    const url = request.nextUrl.clone();
    url.pathname = onboardingComplete ? "/app" : "/onboarding";
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/app") && !onboardingComplete) {
    const url = request.nextUrl.clone();
    url.pathname = "/onboarding";
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/onboarding") && onboardingComplete) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }

  if (pathname === "/onboarding" || pathname === "/onboarding/") {
    const url = request.nextUrl.clone();
    url.pathname = `/onboarding/${currentStep}`;
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
