/**
 * The invite code has to survive the OAuth round-trip through Google, so
 * signUpWithGoogle parks it in this short-lived httpOnly cookie and
 * /auth/callback reads (and clears) it when deciding whether a freshly
 * minted account came through the gate. Scoped to /auth so it rides along
 * only on the callback request. SameSite=Lax still sends it there: the
 * return from Google is a top-level GET navigation.
 */
export const INVITE_COOKIE = "cc-invite";
export const INVITE_COOKIE_PATH = "/auth";
