import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { createDb } from "~/db/client";
import {
  generation,
  image,
  type GenerationStatus,
} from "~/db/schema";
import { getImage, type GalleryImage } from "~/lib/images.server";
import { createShareToken, isShareToken, shareImagePath } from "~/lib/share";

export type GenerationJob = {
  id: string;
  status: GenerationStatus;
  prompt: string;
  provider: string;
  structureLock: boolean;
  createdAt: number;
  updatedAt: number;
  error: string | null;
  inspirationIds: string[];
  inspirations: GalleryImage[];
  base: GalleryImage | null;
  result: GalleryImage | null;
};

function toGallery(
  row: typeof image.$inferSelect,
  url: string = `/api/images/${row.id}`,
): GalleryImage {
  return {
    id: row.id,
    filename: row.filename,
    kind: row.kind,
    createdAt: row.createdAt,
    url,
  };
}

export function parseInspirationIds(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

function toJob(
  row: typeof generation.$inferSelect,
  imagesById: Map<string, GalleryImage>,
): GenerationJob {
  return {
    id: row.id,
    status: row.status,
    prompt: row.prompt,
    provider: row.provider,
    structureLock: row.structureLock,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    error: row.error,
    inspirationIds: parseInspirationIds(row.inspirationIds),
    inspirations: parseInspirationIds(row.inspirationIds)
      .map((id) => imagesById.get(id))
      .filter((item): item is GalleryImage => Boolean(item)),
    base: imagesById.get(row.baseImageId) ?? null,
    result: row.resultImageId
      ? (imagesById.get(row.resultImageId) ?? null)
      : null,
  };
}

function recipeImageIds(row: typeof generation.$inferSelect): string[] {
  const ids = [row.baseImageId, ...parseInspirationIds(row.inspirationIds)];
  if (row.resultImageId) {
    ids.push(row.resultImageId);
  }
  return ids;
}

async function attachImages(
  env: Env,
  rows: (typeof generation.$inferSelect)[],
  urlFor: (imageId: string) => string = (imageId) => `/api/images/${imageId}`,
): Promise<GenerationJob[]> {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const id of recipeImageIds(row)) {
      ids.add(id);
    }
  }

  const imagesById = new Map<string, GalleryImage>();
  if (ids.size > 0) {
    const db = createDb(env);
    const imageRows = await db
      .select()
      .from(image)
      .where(inArray(image.id, [...ids]));
    for (const row of imageRows) {
      imagesById.set(row.id, toGallery(row, urlFor(row.id)));
    }
  }

  return rows.map((row) => toJob(row, imagesById));
}

export async function userHasGenerations(
  env: Env,
  userId: string,
): Promise<boolean> {
  const db = createDb(env);
  const rows = await db
    .select({ id: generation.id })
    .from(generation)
    .where(eq(generation.userId, userId))
    .limit(1);
  return rows.length > 0;
}

export async function listUserGenerations(
  env: Env,
  userId: string,
): Promise<GenerationJob[]> {
  const db = createDb(env);
  const rows = await db
    .select()
    .from(generation)
    .where(eq(generation.userId, userId))
    .orderBy(desc(generation.createdAt));
  return attachImages(env, rows);
}

export async function getGeneration(
  env: Env,
  jobId: string,
): Promise<(typeof generation.$inferSelect) | null> {
  const db = createDb(env);
  const rows = await db
    .select()
    .from(generation)
    .where(eq(generation.id, jobId))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertRunningGeneration(input: {
  env: Env;
  userId: string;
  baseImageId: string;
  inspirationIds: string[];
  prompt: string;
  provider: string;
  structureLock: boolean;
}): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const db = createDb(input.env);
  await db.insert(generation).values({
    id,
    userId: input.userId,
    status: "running",
    baseImageId: input.baseImageId,
    inspirationIds: JSON.stringify(input.inspirationIds),
    prompt: input.prompt,
    provider: input.provider,
    structureLock: input.structureLock,
    resultImageId: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function markGenerationDone(input: {
  env: Env;
  jobId: string;
  resultImageId: string;
}): Promise<void> {
  const existing = await getGeneration(input.env, input.jobId);
  const shareToken = existing?.shareToken ?? createShareToken();
  const db = createDb(input.env);
  await db
    .update(generation)
    .set({
      status: "done",
      resultImageId: input.resultImageId,
      shareToken,
      error: null,
      updatedAt: Date.now(),
    })
    .where(eq(generation.id, input.jobId));
}

export async function ensureShareToken(
  env: Env,
  jobId: string,
): Promise<string> {
  const existing = await getGeneration(env, jobId);
  if (!existing) {
    throw new Error("Generation not found");
  }
  if (existing.shareToken) {
    return existing.shareToken;
  }

  const db = createDb(env);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = createShareToken();
    try {
      await db
        .update(generation)
        .set({ shareToken: token, updatedAt: Date.now() })
        .where(and(eq(generation.id, jobId), isNull(generation.shareToken)));
    } catch {
      continue;
    }
    const again = await getGeneration(env, jobId);
    if (again?.shareToken) {
      return again.shareToken;
    }
  }

  throw new Error("Could not create a share token");
}

export async function getSharedGeneration(
  env: Env,
  token: string,
): Promise<(typeof generation.$inferSelect) | null> {
  if (!isShareToken(token)) {
    return null;
  }
  const db = createDb(env);
  const rows = await db
    .select()
    .from(generation)
    .where(eq(generation.shareToken, token))
    .limit(1);
  const row = rows[0];
  if (!row || row.status !== "done" || !row.resultImageId) {
    return null;
  }
  return row;
}

export async function getSharedGenerationJob(
  env: Env,
  token: string,
): Promise<{ job: GenerationJob; userId: string } | null> {
  const row = await getSharedGeneration(env, token);
  if (!row) {
    return null;
  }
  const [job] = await attachImages(env, [row], (imageId) =>
    shareImagePath(token, imageId),
  );
  if (!job) {
    return null;
  }
  return { job, userId: row.userId };
}

export async function getSharedImage(
  env: Env,
  token: string,
  imageId: string,
): Promise<typeof image.$inferSelect | null> {
  const row = await getSharedGeneration(env, token);
  if (!row) {
    return null;
  }
  if (!recipeImageIds(row).includes(imageId)) {
    return null;
  }
  return getImage(env, imageId);
}

export async function markGenerationFailed(input: {
  env: Env;
  jobId: string;
  error: string;
}): Promise<void> {
  const db = createDb(input.env);
  await db
    .update(generation)
    .set({
      status: "failed",
      error: input.error,
      updatedAt: Date.now(),
    })
    .where(eq(generation.id, input.jobId));
}

export async function getUserGenerationJob(
  env: Env,
  userId: string,
  jobId: string,
): Promise<GenerationJob | null> {
  const row = await getGeneration(env, jobId);
  if (!row || row.userId !== userId) {
    return null;
  }
  const [job] = await attachImages(env, [row]);
  return job ?? null;
}

export function lastDoneJob(jobs: GenerationJob[]): GenerationJob | null {
  return jobs.find((job) => job.status === "done" && job.result) ?? null;
}

export function latestRunningJob(jobs: GenerationJob[]): GenerationJob | null {
  return jobs.find((job) => job.status === "running") ?? null;
}
