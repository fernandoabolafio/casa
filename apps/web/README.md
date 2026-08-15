# @casa/web

One React Router 8 SSR Worker. Better Auth + D1 + Drizzle + R2, same family as joga-app `web/` / backend, without a second Hono service.

```bash
cp .dev.vars.example .dev.vars
pnpm --filter @casa/web db:migrate
pnpm --filter @casa/web dev
```

Sign up at `/sign-up`, then `/generate`. Uploads go to R2. The gallery is per user. Working-set slots (Base / References / Inspirations) pick from that gallery. Generate stays disabled.

```bash
pnpm --filter @casa/web deploy
```

CI applies D1 migrations remotely, then `npx wrangler deploy`. GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

Worker secrets:

```bash
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put BETTER_AUTH_URL
```
