import { z } from "zod";

import type { Route } from "./+types/api.generate-scene";

import { getEnv } from "~/lib/env.server";
import { enqueueGeneration } from "~/lib/generate/start";
import { providerSchema } from "~/lib/generate/scene";
import { requireAuth } from "~/lib/require-auth";

const bodySchema = z.object({
  provider: providerSchema.default("openai"),
  direction: z.string().optional(),
  structureLock: z.boolean().optional(),
  baseId: z.string().min(1),
  inspirationIds: z.array(z.string()).optional(),
});

export function loader() {
  return Response.json({ error: "method_not_allowed" }, { status: 405 });
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }

  const user = await requireAuth(request, context);
  const env = getEnv(context);

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid generate request." }, { status: 400 });
  }

  try {
    const { jobId } = await enqueueGeneration({
      env,
      userId: user.id,
      baseImageId: parsed.baseId,
      inspirationIds: parsed.inspirationIds ?? [],
      prompt: parsed.direction ?? "",
      provider: parsed.provider,
      structureLock: parsed.structureLock !== false,
    });
    return Response.json({ jobId, status: "running" }, { status: 202 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start generation.";
    const status = message.includes("not found") ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
