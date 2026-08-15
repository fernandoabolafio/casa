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
# BETTER_AUTH_URL and PUBLIC_WEB_URL default to http://localhost:5173

pnpm --filter @casa/web db:migrate
pnpm --filter @casa/web dev
```

Open http://localhost:5173. Sign up. First visit lands on `/generate/room`. Local generate needs `OPENAI_API_KEY` / `GEMINI_API_KEY` in `.dev.vars`.

Local D1 and R2 are Wrangler's emulators. `db:migrate` applies `apps/web/drizzle` to the local `casa` database.

Legacy canvas (tldraw):

```bash
cp apps/canvas/.env.local.example apps/canvas/.env.local
pnpm --filter @casa/canvas dev
```

Canvas listens on http://localhost:3000.

## Auth, D1, R2

Copied from [joga-app](https://github.com/fernandoabolafio/joga-app). Casa keeps auth on this same Worker. Joga only split Hono for iOS/video, not for Better Auth.

| joga-app | Casa |
|---|---|
| `backend/src/auth.ts` | `apps/web/app/lib/auth.server.ts` |
| `backend/src/middleware/auth.ts` | `apps/web/app/lib/require-auth.ts` |
| `web/app/lib/auth.ts` | `apps/web/app/lib/auth.ts` |
| `backend/src/db/schema.ts` (user/session/account/verification) | `apps/web/app/db/schema.ts` |
| `backend/drizzle/0000_wild_warhawk.sql` | `apps/web/drizzle/0000_wild_warhawk.sql` |
| Hono `auth.handler` mount | `apps/web/app/routes/api.auth.$.ts` |
| Worker `env.<BUCKET>.put` after requireAuth | `apps/web/app/lib/images.server.ts` |

Vars in `apps/web/wrangler.jsonc`: `BETTER_AUTH_URL` and `PUBLIC_WEB_URL` are https://casa-web.hi-c3a.workers.dev. Local `.dev.vars` still uses localhost.

Worker secret (not GitHub):

```bash
cd apps/web
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put GEMINI_API_KEY
```

Those image keys are already set on the live Worker. Do not put them in the repo or in GitHub secrets.

GitHub secrets stay `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. This repo does not have them yet, so CI cannot deploy. Deploy from a machine with `wrangler` logged in.

D1 `casa` (`06906658-5515-4f5d-9064-b5a65a01bc2e`) and R2 `casa-images` already exist. Do not create another database or bucket.

Live: https://casa-web.hi-c3a.workers.dev

`/` is the job list after the first generate. Compose is `/generate/room`, `/generate/looks`, `/generate/mosaic`. Generate starts the `casa-generate-scene` Cloudflare Workflow and returns to Home with a Running job. The prompt engine is still `apps/web/app/lib/generate/`. Edit-scene and Whisper stay 501.

After you pull this branch, apply the new D1 migration and deploy from a logged-in box:

```bash
cd apps/web
npx wrangler d1 migrations apply casa --remote
npx wrangler deploy
```

The workflow binding is already in `wrangler.jsonc` (`GENERATE_SCENE` / `GenerateSceneWorkflow` / `casa-generate-scene`). First deploy registers it. No new secrets.

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

Generate on web copies the canvas prompt engine into `apps/web/app/lib/generate/` (no Next.js, no tldraw). Edit-scene and Whisper stay 501.
