# Coach Casey

AI-powered run coaching platform. Next.js on Vercel, Python functions for the coaching pipeline, Supabase for data and auth.

## Local setup

1. Install prerequisites: Node 22+, Python 3.12+, [pnpm](https://pnpm.io/), [uv](https://docs.astral.sh/uv/).
2. Copy `.env.example` to `.env.local` and fill in dev credentials. Set `LLM_MODE=mock` locally to avoid burning API credits.
3. Install deps:
   ```bash
   pnpm install
   uv sync
   ```
4. Run the dev server:
   ```bash
   pnpm dev
   ```

## Layout

- `app/` — Next.js App Router pages and UI.
- `api/` — Python serverless functions (Vercel Python runtime). `api/_shared/` holds shared config, DB, LLM clients, observability.
- `supabase/` — SQL migrations and seeds, applied via the Supabase CLI.
- `prompts/` — LLM prompt templates and prompt-engineering principles.
- `scripts/` — one-off scripts and maintenance utilities.
- `docs/` — product, engineering, and strategy docs. Start with `docs/engineering-foundation.md` and `docs/foundation-setup-spec.md`.

## Deployment

Every push to `main` deploys to Vercel. Env vars are managed in the Vercel dashboard (Production + Preview) and locally in `.env.local`.
