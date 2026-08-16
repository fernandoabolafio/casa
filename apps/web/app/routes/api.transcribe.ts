import type { Route } from "./+types/api.transcribe";

/**
 * TODO: voice prompt
 *
 * Port Whisper transcription from `apps/canvas/app/api/transcribe`
 * and `apps/canvas/lib/transcribe.ts`. Accept audio, return text for the
 * generate prompt field.
 */
export function action(_args: Route.ActionArgs) {
  return Response.json(
    {
      error: "not_implemented",
      todo: "voice-prompt",
    },
    { status: 501 },
  );
}
