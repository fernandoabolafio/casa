import type { Route } from "./+types/api.jobs";

import { getEnv } from "~/lib/env.server";
import { listUserGenerations } from "~/lib/generations.server";
import { requireAuth } from "~/lib/require-auth";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireAuth(request, context);
  const jobs = await listUserGenerations(getEnv(context), user.id);
  return Response.json({ jobs, now: Date.now() });
}
