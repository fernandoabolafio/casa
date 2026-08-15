import type { Route } from "./+types/api.generate-scene";

/**
 * TODO: generate-scene
 *
 * Port the OpenAI + Gemini scene generation from
 * `apps/canvas/app/api/generate-scene` and `apps/canvas/lib/openai-images.ts`.
 * Do not extract a shared package until the request/response shape is stable.
 *
 * Expected later: multipart images, prompt, provider, quality.
 * Secrets: OPENAI_API_KEY, GEMINI_API_KEY (wrangler secret / .dev.vars).
 */
export function action(_args: Route.ActionArgs) {
  return Response.json(
    {
      error: "not_implemented",
      todo: "generate-scene",
    },
    { status: 501 },
  );
}
