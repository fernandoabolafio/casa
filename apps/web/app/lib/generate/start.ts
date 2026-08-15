import { LOOK_CAP } from "~/lib/compose";
import {
  insertRunningGeneration,
  markGenerationFailed,
} from "~/lib/generations.server";
import { providerSchema } from "~/lib/generate/scene";
import { getOwnedImage } from "~/lib/images.server";

export type EnqueueGenerationInput = {
  env: Env;
  userId: string;
  baseImageId: string;
  inspirationIds: string[];
  prompt: string;
  provider: string;
  structureLock: boolean;
};

export async function enqueueGeneration(
  input: EnqueueGenerationInput,
): Promise<{ jobId: string }> {
  const provider = providerSchema.parse(input.provider);
  const lookIds = [...new Set(input.inspirationIds)].slice(0, LOOK_CAP);

  const base = await getOwnedImage(input.env, input.userId, input.baseImageId);
  if (!base) {
    throw new Error("Base image not found.");
  }

  for (const id of lookIds) {
    const look = await getOwnedImage(input.env, input.userId, id);
    if (!look) {
      throw new Error("A look image was not found.");
    }
  }

  const jobId = await insertRunningGeneration({
    env: input.env,
    userId: input.userId,
    baseImageId: input.baseImageId,
    inspirationIds: lookIds,
    prompt: input.prompt.trim(),
    provider,
    structureLock: input.structureLock,
  });

  try {
    await input.env.GENERATE_SCENE.create({
      id: jobId,
      params: { jobId },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not start the generation workflow.";
    await markGenerationFailed({
      env: input.env,
      jobId,
      error: message,
    });
    throw new Error(message);
  }

  return { jobId };
}
