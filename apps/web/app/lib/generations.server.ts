import { desc, eq, inArray } from "drizzle-orm";

import { createDb } from "~/db/client";
import {
  generation,
  image,
  type GenerationStatus,
} from "~/db/schema";
import type { GalleryImage } from "~/lib/images.server";

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
  base: GalleryImage | null;
  result: GalleryImage | null;
};

function toGallery(row: typeof image.$inferSelect): GalleryImage {
  return {
    id: row.id,
    filename: row.filename,
    kind: row.kind,
    createdAt: row.createdAt,
    url: `/api/images/${row.id}`,
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
    base: imagesById.get(row.baseImageId) ?? null,
    result: row.resultImageId
      ? (imagesById.get(row.resultImageId) ?? null)
      : null,
  };
}

async function attachImages(
  env: Env,
  rows: (typeof generation.$inferSelect)[],
): Promise<GenerationJob[]> {
  const ids = new Set<string>();
  for (const row of rows) {
    ids.add(row.baseImageId);
    if (row.resultImageId) {
      ids.add(row.resultImageId);
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
      imagesById.set(row.id, toGallery(row));
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
  const db = createDb(input.env);
  await db
    .update(generation)
    .set({
      status: "done",
      resultImageId: input.resultImageId,
      error: null,
      updatedAt: Date.now(),
    })
    .where(eq(generation.id, input.jobId));
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

export function lastDoneJob(jobs: GenerationJob[]): GenerationJob | null {
  return jobs.find((job) => job.status === "done" && job.result) ?? null;
}

export function latestRunningJob(jobs: GenerationJob[]): GenerationJob | null {
  return jobs.find((job) => job.status === "running") ?? null;
}
