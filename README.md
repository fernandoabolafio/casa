# Casa

pnpm workspace. Two apps:

- `apps/web` (`@casa/web`) is the product. One React Router 8 SSR Worker.
- `apps/canvas` (`@casa/canvas`) is the original Next.js + tldraw board. Reference only. It still runs and still has generate / edit / Whisper. It will be phased out later, not deleted.

## Install

Node 20.9 or newer for the repo. `@casa/web` is React Router 8 and needs Node 22. pnpm 9 or newer.

```bash
pnpm install
```

Do not use npm or bun at the root. `pnpm-lock.yaml` is the lockfile.

## Run

Product app:

```bash
pnpm --filter @casa/web dev
# or
pnpm dev
```

Legacy canvas (tldraw):

```bash
cp apps/canvas/.env.local.example apps/canvas/.env.local
pnpm --filter @casa/canvas dev
```

Canvas listens on http://localhost:3000. Web uses the Vite / Workers port Vite prints (usually 5173).

## Deploy

`apps/web` is one Worker. Same path as `web/` in [joga-app](https://github.com/fernandoabolafio/joga-app): `workers/app.ts`, `wrangler.jsonc` with `nodejs_compat`, `react-router dev` locally, build then `npx wrangler deploy` in production.

```bash
pnpm --filter @casa/web deploy
```

CI (`.github/workflows/deploy.yml`) matches joga-app: push `main` or `workflow_dispatch`, Node 22, install, build `@casa/web`, `npx wrangler deploy`. Repo secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

OpenAI / Gemini keys are not workflow secrets. Set them on the Worker:

```bash
cd apps/web
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put GEMINI_API_KEY
```

Public URLs can go in `apps/web/wrangler.jsonc` `vars`. No custom domain yet. `workers.dev` is fine.

Canvas still uses OpenNext + Wrangler (`apps/canvas/wrangler.jsonc`). This PR does not change that path. CI deploys the new RR app only.

```bash
pnpm --filter @casa/canvas deploy
```

## Layout

```
apps/web      product (React Router 8 SSR Worker)
apps/canvas   reference tldraw / Next.js app
```

No shared `packages/` yet. Prompt / image / Whisper code stays in canvas until a cut can be made without changing behavior.
