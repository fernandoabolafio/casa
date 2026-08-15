import type { Route } from "./+types/api.auth.$";

import { createAuth } from "~/lib/auth.server";
import { getEnv } from "~/lib/env.server";

export function loader({ request, context }: Route.LoaderArgs) {
  return createAuth(getEnv(context), request).handler(request);
}

export function action({ request, context }: Route.ActionArgs) {
  return createAuth(getEnv(context), request).handler(request);
}
