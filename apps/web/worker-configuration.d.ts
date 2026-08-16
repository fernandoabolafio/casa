// Keep in sync with wrangler.jsonc bindings and `.dev.vars`.
// Secret: wrangler secret put BETTER_AUTH_SECRET
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    IMAGES: R2Bucket;
    GENERATE_SCENE: Workflow<{ jobId: string }>;
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    PUBLIC_WEB_URL: string;
    OPENAI_API_KEY?: string;
    GEMINI_API_KEY?: string;
    GOOGLE_API_KEY?: string;
  }
}

interface Env extends Cloudflare.Env {}
