# Casa

pnpm workspace. Two apps:

- `apps/web` (`@casa/web`) is the product. One React Router 8 SSR Worker with Better Auth, D1, and R2.
- `apps/canvas` (`@casa/canvas`) is the original Next.js + tldraw board. Reference only. It still runs and still has generate / edit / Whisper. It will be phased out later, not deleted.

## Install

Node 22.22 or newer. pnpm 9 or newer.

```bash
pnpm install
```

Do not use npm or bun at the root. `pnpm-lock.yaml` is the lockfile.

## Run the product app

```bash
cp apps/web/.dev.vars.example apps/web/.dev.vars
# BETTER_AUTH_SECRET must be at least 32 characters
# BETTER_AUTH_URL=http://localhost:5173

pnpm --filter @casa/web db:migrate
pnpm --filter @casa/web dev
```

Open http://localhost:5173. Sign up, then `/generate` to upload images and pick a working set.

Local D1 and R2 are Wrangler's emulators. `db:migrate` applies `apps/web/drizzle/migrations` to the local `casa` database.

Legacy canvas (tldraw):

```bash
cp apps/canvas/.env.local.example apps/canvas/.env.local
pnpm --filter @casa/canvas dev
```

Canvas listens on http://localhost:3000.

## Auth, D1, R2

Same family as `web/` + backend in [joga-app](https://github.com/fernandoabolafio/joga-app): Better Auth, Drizzle, D1, R2. Casa keeps that on **one** Worker (no Hono service). joga-app is private from this agent, so the files copied by shape are:

- Better Auth + Drizzle adapter (`@better-auth/drizzle-adapter`)
- D1 binding + `migrations_dir` in `wrangler.jsonc`
- `wrangler d1 migrations apply … --remote` before `npx wrangler deploy`
- R2 binding for bytes; metadata in D1
- GitHub secrets stay `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`

Worker secrets (not GitHub):

```bash
cd apps/web
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put BETTER_AUTH_URL
# later
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put GEMINI_API_KEY
```

Before the first remote deploy, create the D1 database and R2 bucket, then put the real D1 id in `apps/web/wrangler.jsonc` (placeholder `00000000-0000-0000-0000-000000000000` is local-only):

```bash
npx wrangler d1 create casa
npx wrangler r2 bucket create casa-images
```

## Deploy

```bash
pnpm --filter @casa/web deploy
```

CI (`.github/workflows/deploy.yml`): push `main` or `workflow_dispatch`, Node 22, install, build `@casa/web`, `npx wrangler d1 migrations apply casa --remote`, `npx wrangler deploy`.

Canvas still uses OpenNext. CI deploys the RR app only.

```bash
pnpm --filter @casa/canvas deploy
```

## Layout

```
apps/web      product (React Router 8 SSR Worker)
apps/canvas   reference tldraw / Next.js app
```

Generate / edit / Whisper engines stay in canvas. `/api/generate-scene` on web is still 501.
