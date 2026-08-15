import type { Route } from "./+types/api.images.$id";

import { getEnv } from "~/lib/env.server";
import { getOwnedImage } from "~/lib/images.server";
import { getOptionalUser } from "~/lib/session.server";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = await getOptionalUser(request, context);
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const env = getEnv(context);
  const row = await getOwnedImage(env, user.id, params.id);
  if (!row) {
    return new Response("Not found", { status: 404 });
  }

  const object = await env.IMAGES.get(row.r2Key);
  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": row.contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
