import { desc, eq } from "drizzle-orm";

import { createDb } from "~/db/client";
import { image, type ImageKind } from "~/db/schema";

const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const maxBytes = 8 * 1024 * 1024;

export type GalleryImage = {
  id: string;
  filename: string;
  kind: ImageKind;
  createdAt: number;
  url: string;
};

export async function listUserImages(
  env: Env,
  userId: string,
): Promise<GalleryImage[]> {
  const db = createDb(env);
  const rows = await db
    .select()
    .from(image)
    .where(eq(image.userId, userId))
    .orderBy(desc(image.createdAt));

  return rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    kind: row.kind,
    createdAt: row.createdAt,
    url: `/api/images/${row.id}`,
  }));
}

export async function getOwnedImage(env: Env, userId: string, imageId: string) {
  const db = createDb(env);
  const rows = await db.select().from(image).where(eq(image.id, imageId));
  const row = rows[0];
  if (!row || row.userId !== userId) {
    return null;
  }
  return row;
}

export async function storeUpload(input: {
  env: Env;
  userId: string;
  file: File;
  kind?: ImageKind;
}): Promise<GalleryImage> {
  const { env, userId, file } = input;
  const kind = input.kind ?? "upload";

  if (!allowedTypes.has(file.type)) {
    throw new Error("Only JPEG, PNG, WebP, and GIF uploads are allowed.");
  }
  if (file.size > maxBytes) {
    throw new Error("Image must be 8 MB or smaller.");
  }

  const id = crypto.randomUUID();
  const r2Key = `${userId}/${id}`;

  // Joga uploads are Worker PUT after requireAuth, not presigned S3.
  await env.IMAGES.put(r2Key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  const createdAt = Date.now();
  const filename = file.name || `${id}.bin`;
  const db = createDb(env);
  await db.insert(image).values({
    id,
    userId,
    r2Key,
    contentType: file.type,
    kind,
    filename,
    createdAt,
  });

  return {
    id,
    filename,
    kind,
    createdAt,
    url: `/api/images/${id}`,
  };
}

export async function loadOwnedImageFile(
  env: Env,
  userId: string,
  imageId: string,
): Promise<File | null> {
  const row = await getOwnedImage(env, userId, imageId);
  if (!row) {
    return null;
  }

  const object = await env.IMAGES.get(row.r2Key);
  if (!object) {
    return null;
  }

  return new File([await object.arrayBuffer()], row.filename, {
    type: row.contentType,
  });
}

export async function storeGeneratedImage(input: {
  env: Env;
  userId: string;
  bytes: ArrayBuffer;
  filename?: string;
}): Promise<GalleryImage> {
  const { env, userId, bytes } = input;
  const id = crypto.randomUUID();
  const r2Key = `${userId}/${id}`;
  const filename = input.filename ?? `generation-${id}.png`;

  await env.IMAGES.put(r2Key, bytes, {
    httpMetadata: { contentType: "image/png" },
  });

  const createdAt = Date.now();
  const db = createDb(env);
  await db.insert(image).values({
    id,
    userId,
    r2Key,
    contentType: "image/png",
    kind: "generation",
    filename,
    createdAt,
  });

  return {
    id,
    filename,
    kind: "generation",
    createdAt,
    url: `/api/images/${id}`,
  };
}
