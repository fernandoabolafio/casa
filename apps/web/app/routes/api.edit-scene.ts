import type { Route } from "./+types/api.edit-scene";

/**
 * TODO: edit-scene
 *
 * Port masked edit from `apps/canvas/app/api/edit-scene`.
 * OpenAI image edit only, in the canvas app today.
 */
export function action(_args: Route.ActionArgs) {
  return Response.json(
    {
      error: "not_implemented",
      todo: "edit-scene",
    },
    { status: 501 },
  );
}
