# @casa/web

One React Router 8 SSR Worker. Better Auth + D1 + Drizzle + R2, copied from joga-app `web/` + `backend/`, without a second Hono service.

```bash
cp .dev.vars.example .dev.vars
pnpm --filter @casa/web db:migrate
pnpm --filter @casa/web dev
```

Sign up at `/sign-up`, then `/generate`. Uploads are Worker `IMAGES.put` after `requireAuth`. The gallery is per user. Working-set slots pick from that gallery. Generate stays disabled.

```bash
pnpm --filter @casa/web deploy
```

CI applies D1 migrations remotely (`migrations_dir: drizzle`), then `npx wrangler deploy`. GitHub does not have `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` yet, so that workflow cannot deploy until those secrets exist.

D1 `casa` and R2 `casa-images` already exist. Do not create another. `OPENAI_API_KEY` and `GEMINI_API_KEY` are still unset.

Vars in `wrangler.jsonc` (override in `.dev.vars` locally): `BETTER_AUTH_URL`, `PUBLIC_WEB_URL`. After the first production deploy, set both to the `casa-web` workers.dev URL.

Worker secret:

```bash
npx wrangler secret put BETTER_AUTH_SECRET
```
