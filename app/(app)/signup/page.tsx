import Link from "next/link";
import { isValidInviteCode } from "@/lib/auth/invite";
import { SignUpForm } from "@/app/(app)/_components/signup-form";

// Early access: account creation is gated behind an invite code carried in the
// link (…/signup?code=THECODE). Without a valid code we render an invite-only
// screen rather than the form, and the server action re-checks the code anyway.
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  if (!isValidInviteCode(code)) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-5">
          <h1 className="font-serif text-3xl leading-tight text-ink">
            Invite-only, for now.
          </h1>
          <p className="font-sans text-sm leading-relaxed text-ink-muted">
            Coach Casey is in early access with a small group of marathoners.
            Want in? Email{" "}
            <a
              href="mailto:hello@coachcasey.app?subject=Coach%20Casey%20early%20access"
              className="text-accent underline underline-offset-4"
            >
              hello@coachcasey.app
            </a>{" "}
            and we&rsquo;ll send you a link.
          </p>
          <p className="font-sans text-sm text-ink-muted">
            Already have an account?{" "}
            <Link
              href="/signin"
              className="text-accent underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return <SignUpForm code={code ?? ""} />;
}
