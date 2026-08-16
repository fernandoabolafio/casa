# @casa/web

One React Router 8 SSR Worker. Better Auth + D1 + Drizzle + R2, copied from joga-app `web/` + `backend/`, without a second Hono service.

```bash
cp .dev.vars.example .dev.vars
pnpm --filter @casa/web db:migrate
pnpm --filter @casa/web dev
```

Sign up at `/sign-up`. First visit with no jobs goes to `/generate/room`. Uploads are Worker `IMAGES.put` after `requireAuth`. Library pickers split Uploads and Generations. Generate inserts a `generation` row, starts the `GENERATE_SCENE` workflow, and sends you to `/`. The workflow loads owned R2 bytes, runs `app/lib/generate/`, writes a PNG as `kind: generation`, and marks the job done.

```bash
pnpm --filter @casa/web deploy
```

CI applies D1 migrations remotely (`migrations_dir: drizzle`), then `npx wrangler deploy`. GitHub does not have `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` yet, so that workflow cannot deploy until those secrets exist.

D1 `casa` and R2 `casa-images` already exist. Do not create another.

Live: https://casa-web.hi-c3a.workers.dev

`OPENAI_API_KEY` and `GEMINI_API_KEY` are Worker secrets, not repo or GitHub secrets. Edit-scene and Whisper stay 501.

Vars in `wrangler.jsonc` (override in `.dev.vars` locally): `BETTER_AUTH_URL` and `PUBLIC_WEB_URL` are the live workers.dev URL.

Worker secret:

```bash
npx wrangler secret put BETTER_AUTH_SECRET
```
