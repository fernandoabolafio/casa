// Keep in sync with wrangler.jsonc bindings and `.dev.vars`.
// Secrets: wrangler secret put. Do not commit real values.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    IMAGES: R2Bucket;
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    OPENAI_API_KEY?: string;
    GEMINI_API_KEY?: string;
    GOOGLE_API_KEY?: string;
  }
}

interface Env extends Cloudflare.Env {}
