# @casa/canvas

Reference / legacy Casa app. Next.js + tldraw canvas, OpenNext on Cloudflare Workers.

This is not the product going forward. Keep it runnable while the new app in `apps/web` is built. Do not delete the generate / edit / whisper implementation here.

```bash
# from repo root
pnpm --filter @casa/canvas dev
```

Open http://localhost:3000

Copy `apps/canvas/.env.local.example` to `apps/canvas/.env.local` for provider keys.

Deploy (same OpenNext + wrangler path as before):

```bash
pnpm --filter @casa/canvas deploy
```
