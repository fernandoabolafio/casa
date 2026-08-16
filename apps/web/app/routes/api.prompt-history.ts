import type { Route } from "./+types/api.prompt-history";

/**
 * TODO: prompt history
 *
 * Canvas keeps history in the client (`apps/canvas/components/design-board.tsx`).
 * Decide persistence (cookie, KV, D1) before implementing. Leave prompts in
 * the canvas app until that cut is clean.
 */
export function loader(_args: Route.LoaderArgs) {
  return Response.json(
    {
      error: "not_implemented",
      todo: "prompt-history",
      items: [],
    },
    { status: 501 },
  );
}

export function action(_args: Route.ActionArgs) {
  return Response.json(
    {
      error: "not_implemented",
      todo: "prompt-history",
    },
    { status: 501 },
  );
}
