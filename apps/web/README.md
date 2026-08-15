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

CI applies D1 migrations remotely (`migrations_dir: drizzle`), then `npx wrangler deploy`. GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

Vars in `wrangler.jsonc` (override in `.dev.vars` locally): `BETTER_AUTH_URL`, `PUBLIC_WEB_URL`.

Worker secret:

```bash
npx wrangler secret put BETTER_AUTH_SECRET
```
