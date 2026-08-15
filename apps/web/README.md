# @casa/web

De-facto Casa product. One React Router 8 SSR Worker, same shape as `web/` in joga-app.

```bash
# from repo root
pnpm --filter @casa/web dev
```

Open the URL Vite prints (usually http://localhost:5173).

```bash
pnpm --filter @casa/web deploy
# react-router build && wrangler deploy
```

CI (`.github/workflows/deploy.yml`) is the joga-app path: install, build, `npx wrangler deploy` on `main` or `workflow_dispatch`. Needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

OpenAI / Gemini keys are Worker secrets, not GitHub secrets:

```bash
cd apps/web
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put GEMINI_API_KEY
```

Copy `.dev.vars.example` to `.dev.vars` for local calls later.
