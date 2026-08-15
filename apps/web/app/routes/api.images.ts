import type { Route } from "./+types/api.images";

import { getEnv } from "~/lib/env.server";
import { listUserImages, storeUpload } from "~/lib/images.server";
import { getOptionalUser } from "~/lib/session.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await getOptionalUser(request, context);
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const images = await listUserImages(getEnv(context), user.id);
  return Response.json({ images });
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await getOptionalUser(request, context);
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (request.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "file_required" }, { status: 400 });
  }

  try {
    const image = await storeUpload({
      env: getEnv(context),
      userId: user.id,
      file,
    });
    return Response.json({ image }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Upload failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}
