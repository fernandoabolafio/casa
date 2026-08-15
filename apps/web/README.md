# @casa/web

De-facto Casa product. React Router v8 on Cloudflare Workers via
`@cloudflare/vite-plugin`.

```bash
# from repo root
pnpm --filter @casa/web dev
```

Open the URL Vite prints (usually http://localhost:5173).

```bash
pnpm --filter @casa/web deploy
```

Needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in CI, or `wrangler login` locally.

Copy `.dev.vars.example` to `.dev.vars` when you start filling in OpenAI / Gemini calls.
