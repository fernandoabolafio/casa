import { z } from "zod";

import type { Route } from "./+types/api.generate-scene";

import { getEnv } from "~/lib/env.server";
import {
  generateScene,
  generatedImageToBytes,
  providerSchema,
  qualitySchema,
} from "~/lib/generate/scene";
import {
  loadOwnedImageFile,
  storeGeneratedImage,
} from "~/lib/images.server";
import { requireAuth } from "~/lib/require-auth";

const bodySchema = z.object({
  provider: providerSchema.default("openai"),
  quality: qualitySchema.default("low"),
  direction: z.string().optional(),
  structureLock: z.boolean().optional(),
  baseId: z.string().optional().nullable(),
  referenceIds: z.array(z.string()).optional(),
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

  const referenceIds = parsed.referenceIds ?? [];
  const inspirationIds = parsed.inspirationIds ?? [];

  try {
    const base = parsed.baseId
      ? await loadOwnedImageFile(env, user.id, parsed.baseId)
      : null;
    if (parsed.baseId && !base) {
      return Response.json({ error: "Base image not found." }, { status: 404 });
    }

    const references = [];
    for (const id of referenceIds) {
      const file = await loadOwnedImageFile(env, user.id, id);
      if (!file) {
        return Response.json(
          { error: "A reference image was not found." },
          { status: 404 },
        );
      }
      references.push({ image: file, hints: [] });
    }

    const inspirations = [];
    for (const id of inspirationIds) {
      const file = await loadOwnedImageFile(env, user.id, id);
      if (!file) {
        return Response.json(
          { error: "An inspiration image was not found." },
          { status: 404 },
        );
      }
      inspirations.push({ image: file, hints: [] });
    }

    if (!base && references.length === 0 && inspirations.length === 0) {
      return Response.json(
        {
          error:
            "Provide a base image, a design reference, or at least one inspiration.",
        },
        { status: 400 },
      );
    }

    const result = await generateScene(
      {
        provider: parsed.provider,
        quality: parsed.quality,
        direction: parsed.direction?.trim() || undefined,
        structureLock: parsed.structureLock,
        base: base ? { image: base, hints: [] } : null,
        references,
        inspirations,
      },
      {
        openaiApiKey: env.OPENAI_API_KEY,
        geminiApiKey: env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY,
      },
    );

    const image = await storeGeneratedImage({
      env,
      userId: user.id,
      bytes: generatedImageToBytes(result),
    });

    return Response.json({
      image,
      prompt: result.revisedPrompt,
      requestId: result.requestId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate the scene.";
    return Response.json({ error: message }, { status: 500 });
  }
}
