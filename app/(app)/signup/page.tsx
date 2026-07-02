import { mayCreateAccount } from "@/lib/auth/invite";
import { SignUpForm } from "@/app/(app)/_components/signup-form";
import { RequestAccessForm } from "@/app/(app)/_components/request-access-form";

// Early access: account creation is gated behind an invite code carried in the
// link (…/signup?code=THECODE). With a valid code we show the create-account
// form; without one we show the request-access form (the visitor leaves their
// details and the founder emails them a link). The signup actions re-check the
// code server-side regardless. Once OPEN_SIGNUP flips, everyone sees the
// create-account form with no code.
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  if (!mayCreateAccount(code)) {
    return <RequestAccessForm />;
  }

  return <SignUpForm code={code ?? ""} />;
}
