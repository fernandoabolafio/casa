import { redirect } from "react-router";

import type { Route } from "./+types/generate._index";

import { composePath, parseCompose } from "~/lib/compose";

export function loader({ request }: Route.LoaderArgs) {
  const compose = parseCompose(new URL(request.url));
  throw redirect(composePath("room", compose));
}
