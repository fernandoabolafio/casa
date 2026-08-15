import {
  getGeneration,
  markGenerationDone,
  parseInspirationIds,
} from "~/lib/generations.server";
import {
  generateScene,
  generatedImageToBytes,
  providerSchema,
} from "~/lib/generate/scene";
import {
  loadOwnedImageFile,
  storeGeneratedImage,
} from "~/lib/images.server";

export async function runGenerationJob(
  env: Env,
  jobId: string,
): Promise<{ resultImageId: string }> {
  const job = await getGeneration(env, jobId);
  if (!job) {
    throw new Error("Generation job not found.");
  }
  if (job.status === "done" && job.resultImageId) {
    return { resultImageId: job.resultImageId };
  }

  const provider = providerSchema.parse(job.provider);
  const lookIds = parseInspirationIds(job.inspirationIds);

  const base = await loadOwnedImageFile(env, job.userId, job.baseImageId);
  if (!base) {
    throw new Error("Base image not found.");
  }

  const inspirations = [];
  for (const id of lookIds) {
    const file = await loadOwnedImageFile(env, job.userId, id);
    if (!file) {
      throw new Error("A look image was not found.");
    }
    inspirations.push({ image: file, hints: [] });
  }

  const result = await generateScene(
    {
      provider,
      quality: "low",
      direction: job.prompt.trim() || undefined,
      structureLock: job.structureLock,
      base: { image: base, hints: [] },
      references: [],
      inspirations,
    },
    {
      openaiApiKey: env.OPENAI_API_KEY,
      geminiApiKey: env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY,
    },
  );

  const stored = await storeGeneratedImage({
    env,
    userId: job.userId,
    bytes: generatedImageToBytes(result),
  });

  await markGenerationDone({
    env,
    jobId,
    resultImageId: stored.id,
  });

  return { resultImageId: stored.id };
}
