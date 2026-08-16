import type { Route } from "./+types/s.$token.i.$imageId";

import { getEnv } from "~/lib/env.server";
import { getSharedImage } from "~/lib/generations.server";

export async function loader({ context, params }: Route.LoaderArgs) {
  const env = getEnv(context);
  const row = await getSharedImage(env, params.token, params.imageId);
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
      "Cache-Control": "public, max-age=86400",
    },
  });
}
