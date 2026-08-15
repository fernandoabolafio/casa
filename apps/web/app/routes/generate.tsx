import type { Route } from "./+types/generate";

import { WorkingSetStudio } from "~/components/working-set-studio";
import { getEnv } from "~/lib/env.server";
import { listUserImages, storeUpload } from "~/lib/images.server";
import { requirePageUser } from "~/lib/require-auth";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requirePageUser(request, context);
  const images = await listUserImages(getEnv(context), user.id);
  return {
    user: { name: user.name, email: user.email },
    images,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requirePageUser(request, context);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent !== "upload") {
    return { error: "Unknown action." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image to upload." };
  }

  try {
    await storeUpload({
      env: getEnv(context),
      userId: user.id,
      file,
    });
    return { ok: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Upload failed.",
    };
  }
}

export default function Generate({ loaderData }: Route.ComponentProps) {
  return (
    <WorkingSetStudio
      userName={loaderData.user.name}
      userEmail={loaderData.user.email}
      images={loaderData.images}
    />
  );
}
