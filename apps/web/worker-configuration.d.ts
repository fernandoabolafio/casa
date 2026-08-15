// Minimal Env until `pnpm --filter @casa/web cf-typegen` is run against a real account.
// Secrets are set with `wrangler secret put`, not committed vars.
declare namespace Cloudflare {
  interface Env {
    OPENAI_API_KEY?: string;
    GEMINI_API_KEY?: string;
    GOOGLE_API_KEY?: string;
  }
}

interface Env extends Cloudflare.Env {}
