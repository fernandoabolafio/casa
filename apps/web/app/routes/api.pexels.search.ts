import type { Route } from "./+types/api.pexels.search";

import { getEnv } from "~/lib/env.server";
import { PexelsConfigError, searchLooks } from "~/lib/pexels.server";
import { requireAuth } from "~/lib/require-auth";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireAuth(request, context);
  const env = getEnv(context);
  const url = new URL(request.url);
  const query = url.searchParams.get("query");
  const baseId = url.searchParams.get("baseId");

  try {
    const payload = await searchLooks({
      env,
      userId: user.id,
      query: query && query.trim().length > 0 ? query : null,
      baseId: baseId && baseId.trim().length > 0 ? baseId : null,
    });
    return Response.json(payload);
  } catch (error) {
    if (error instanceof PexelsConfigError) {
      return Response.json({ error: "pexels_unavailable" }, { status: 503 });
    }
    const message =
      error instanceof Error ? error.message : "Pexels search failed.";
    return Response.json({ error: message }, { status: 502 });
  }
}
