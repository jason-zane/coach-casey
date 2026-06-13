import { isValidInviteCode } from "@/lib/auth/invite";
import { SignUpForm } from "@/app/(app)/_components/signup-form";
import { RequestAccessForm } from "@/app/(app)/_components/request-access-form";

// Early access: account creation is gated behind an invite code carried in the
// link (…/signup?code=THECODE). With a valid code we show the create-account
// form; without one we show the request-access form (the visitor leaves their
// details and the founder emails them a link). The signup action re-checks the
// code server-side regardless.
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  if (!isValidInviteCode(code)) {
    return <RequestAccessForm />;
  }

  return <SignUpForm code={code ?? ""} />;
}
