# Casa

pnpm workspace. Two apps:

- `apps/web` (`@casa/web`) is the product. React Router v8 on Cloudflare Workers.
- `apps/canvas` (`@casa/canvas`) is the original Next.js + tldraw board. Reference only. It still runs and still has generate / edit / Whisper. It will be phased out later, not deleted.

## Install

Node 20.9 or newer. pnpm 9 or newer. `@casa/web` is React Router 8, which wants Node 22.

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

`apps/web` uses Wrangler and `@cloudflare/vite-plugin`, same path as [Cloudflare's React Router guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/).

```bash
pnpm --filter @casa/web deploy
```

CI deploys `@casa/web` on push to `main`. Repo secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Those names are the ones Cloudflare documents for `wrangler-action`.

Canvas still uses OpenNext + Wrangler (`apps/canvas/wrangler.jsonc`), unchanged:

```bash
pnpm --filter @casa/canvas deploy
```

## Layout

```
apps/web      product (React Router v8 + Workers)
apps/canvas   reference tldraw / Next.js app
```

No shared `packages/` yet. Prompt / image / Whisper code stays in canvas until a cut can be made without changing behavior.
