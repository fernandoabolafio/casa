import { z } from "zod";

import type { Route } from "./+types/api.pexels.import";

import { getEnv } from "~/lib/env.server";
import { importPexelsPhoto, PexelsConfigError } from "~/lib/pexels.server";
import { requireAuth } from "~/lib/require-auth";

const bodySchema = z.object({
  id: z.number().int().positive(),
});

export function loader() {
  return Response.json({ error: "method_not_allowed" }, { status: 405 });
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }

  const user = await requireAuth(request, context);

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "photo_required" }, { status: 400 });
  }

  try {
    const image = await importPexelsPhoto({
      env: getEnv(context),
      userId: user.id,
      photoId: parsed.id,
    });
    return Response.json({ image }, { status: 201 });
  } catch (error) {
    if (error instanceof PexelsConfigError) {
      return Response.json({ error: "pexels_unavailable" }, { status: 503 });
    }
    const message =
      error instanceof Error ? error.message : "Could not add that photo.";
    return Response.json({ error: message }, { status: 400 });
  }
}
