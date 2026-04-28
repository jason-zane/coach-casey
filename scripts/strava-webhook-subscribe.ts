/**
 * Strava Push Subscriptions, one-off admin script.
 *
 * Strava allows ONE active push subscription per application. This script
 * lists, creates, or deletes that subscription.
 *
 * Required env:
 *   STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET
 *   STRAVA_WEBHOOK_VERIFY_TOKEN  , any sufficiently long random string;
 *                                    Strava echoes it back during the GET
 *                                    challenge to prove we own the endpoint.
 *   NEXT_PUBLIC_APP_URL          , base URL for the callback
 *
 * Usage:
 *   pnpm tsx scripts/strava-webhook-subscribe.ts list
 *   pnpm tsx scripts/strava-webhook-subscribe.ts create
 *   pnpm tsx scripts/strava-webhook-subscribe.ts delete <id>
 *
 * The callback URL must be publicly reachable and respond to the GET
 * challenge with { "hub.challenge": <value> }. Our endpoint lives at
 * `/api/strava/webhook`, see `app/api/strava/webhook/route.ts`.
 *
 * For local testing you need a public tunnel (e.g. `vercel dev` with a
 * preview URL, or ngrok) pointing at the dev server.
 */

const SUBSCRIPTIONS_URL = "https://www.strava.com/api/v3/push_subscriptions";

type Subscription = {
  id: number;
  callback_url: string;
  created_at: string;
  updated_at: string;
};

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`missing required env var: ${name}`);
  }
  return v;
}

async function list(): Promise<Subscription[]> {
  const id = need("STRAVA_CLIENT_ID");
  const secret = need("STRAVA_CLIENT_SECRET");
  const url = new URL(SUBSCRIPTIONS_URL);
  url.searchParams.set("client_id", id);
  url.searchParams.set("client_secret", secret);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`list failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as Subscription[];
}

async function create(): Promise<Subscription> {
  const id = need("STRAVA_CLIENT_ID");
  const secret = need("STRAVA_CLIENT_SECRET");
  const verify = need("STRAVA_WEBHOOK_VERIFY_TOKEN");
  const appUrl = need("NEXT_PUBLIC_APP_URL").replace(/\/$/, "");
  const callback = `${appUrl}/api/strava/webhook`;

  const body = new URLSearchParams({
    client_id: id,
    client_secret: secret,
    callback_url: callback,
    verify_token: verify,
  });

  const res = await fetch(SUBSCRIPTIONS_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`create failed: ${res.status} ${text}`);
  }
  return JSON.parse(text) as Subscription;
}

async function remove(subId: string): Promise<void> {
  const id = need("STRAVA_CLIENT_ID");
  const secret = need("STRAVA_CLIENT_SECRET");
  const url = new URL(`${SUBSCRIPTIONS_URL}/${subId}`);
  url.searchParams.set("client_id", id);
  url.searchParams.set("client_secret", secret);
  const res = await fetch(url.toString(), { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`delete failed: ${res.status} ${await res.text()}`);
  }
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  switch (cmd) {
    case "list": {
      const subs = await list();
      console.log(JSON.stringify(subs, null, 2));
      break;
    }
    case "create": {
      const sub = await create();
      console.log("created:", JSON.stringify(sub, null, 2));
      break;
    }
    case "delete": {
      if (!arg) {
        console.error("usage: delete <subscription_id>");
        process.exit(1);
      }
      await remove(arg);
      console.log(`deleted subscription ${arg}`);
      break;
    }
    default:
      console.error(
        "usage: pnpm tsx scripts/strava-webhook-subscribe.ts <list|create|delete id>",
      );
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
