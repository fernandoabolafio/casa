import { Buffer } from "node:buffer";

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { loadOwnedImageFile, storeUpload } from "~/lib/images.server";
import {
  normalizeLookQuery,
  type PexelsPhoto,
  type PexelsSearchPayload,
} from "~/lib/pexels";

const PEXELS_SEARCH = "https://api.pexels.com/v1/search";
const PEXELS_PHOTO = "https://api.pexels.com/v1/photos";
const SEARCH_COUNT = 6;
const VISION_MS = 12000;
const VISION_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"] as const;

const pexelsPhotoSchema = z.object({
  id: z.number().int().positive(),
  photographer: z.string(),
  photographer_url: z.string(),
  alt: z.string().optional().default(""),
  src: z.object({
    large: z.string(),
    medium: z.string(),
  }),
});

const pexelsSearchSchema = z.object({
  photos: z.array(pexelsPhotoSchema),
});

const VISION_PROMPT = `Look at this room photo. Reply with ONLY a short search query (2 to 6 words) for color, fabric, or material tone.

The query MUST include at least one color or fabric/material word. Good: velvet fabric, warm oak, green, rust, linen, warm wood velvet armchair. Bad: living room sofa, modern living room, redesign this room, cat, cozy interior.

A sofa in the photo is a tone source, not furniture to copy. No quotes. No explanation.`;

function pexelsKey(env: Env): string | null {
  const key = env.PEXELS_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

function pexelsHeaders(apiKey: string): HeadersInit {
  return { Authorization: apiKey };
}

function isPexelsImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "images.pexels.com";
  } catch {
    return false;
  }
}

function toPhoto(raw: z.infer<typeof pexelsPhotoSchema>): PexelsPhoto | null {
  const src = isPexelsImageUrl(raw.src.medium)
    ? raw.src.medium
    : isPexelsImageUrl(raw.src.large)
      ? raw.src.large
      : null;
  if (!src) {
    return null;
  }
  return {
    id: raw.id,
    photographer: raw.photographer,
    photographerUrl: raw.photographer_url,
    alt: raw.alt,
    src,
  };
}

async function pexelsGet(apiKey: string, url: string): Promise<unknown> {
  const response = await fetch(url, { headers: pexelsHeaders(apiKey) });
  if (!response.ok) {
    throw new Error("Pexels search failed.");
  }
  return response.json();
}

export async function searchPexelsPhotos(
  apiKey: string,
  query: string,
): Promise<PexelsPhoto[]> {
  const url = new URL(PEXELS_SEARCH);
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(SEARCH_COUNT));

  const parsed = pexelsSearchSchema.safeParse(await pexelsGet(apiKey, url.toString()));
  if (!parsed.success) {
    return [];
  }
  return parsed.data.photos
    .map(toPhoto)
    .filter((photo): photo is PexelsPhoto => photo !== null);
}

function creditFilename(photographer: string, id: number, type: string): string {
  const slug =
    photographer
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "pexels";
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  return `pexels-${slug}-${id}.${ext}`;
}

function resolveImageType(contentType: string, src: string): string {
  if (
    contentType === "image/jpeg" ||
    contentType === "image/png" ||
    contentType === "image/webp" ||
    contentType === "image/gif"
  ) {
    return contentType;
  }
  if (src.includes(".png")) {
    return "image/png";
  }
  if (src.includes(".webp")) {
    return "image/webp";
  }
  return "image/jpeg";
}

async function downloadPexelsImage(src: string, filename: string): Promise<File> {
  if (!isPexelsImageUrl(src)) {
    throw new Error("That photo is not from Pexels.");
  }
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error("Could not download that photo.");
  }
  const contentType = resolveImageType(
    response.headers.get("content-type")?.split(";")[0]?.trim() || "",
    src,
  );
  const bytes = await response.arrayBuffer();
  return new File([bytes], filename, { type: contentType });
}

export async function importPexelsPhoto(input: {
  env: Env;
  userId: string;
  photoId: number;
}) {
  const apiKey = pexelsKey(input.env);
  if (!apiKey) {
    throw new PexelsConfigError();
  }

  const raw = pexelsPhotoSchema.parse(
    await pexelsGet(apiKey, `${PEXELS_PHOTO}/${input.photoId}`),
  );
  const large = isPexelsImageUrl(raw.src.large) ? raw.src.large : null;
  const medium = isPexelsImageUrl(raw.src.medium) ? raw.src.medium : null;
  const src = large ?? medium;
  if (!src) {
    throw new Error("That photo has no usable image.");
  }
  let file = await downloadPexelsImage(
    src,
    creditFilename(raw.photographer, raw.id, "image/jpeg"),
  );
  if (file.size > 8 * 1024 * 1024 && medium && src !== medium) {
    file = await downloadPexelsImage(
      medium,
      creditFilename(raw.photographer, raw.id, file.type),
    );
  }

  return storeUpload({
    env: input.env,
    userId: input.userId,
    file,
    kind: "upload",
  });
}

function textFromGemini(response: {
  text?: string;
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
  }>;
}): string {
  const fromGetter = response.text?.trim();
  if (fromGetter) {
    return fromGetter;
  }
  return (response.candidates?.[0]?.content?.parts ?? [])
    .filter((part) => !part.thought && Boolean(part.text))
    .map((part) => part.text ?? "")
    .join(" ")
    .trim();
}

async function suggestFromVision(
  env: Env,
  userId: string,
  baseId: string,
): Promise<string | null> {
  const apiKey = env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY;
  if (!apiKey) {
    return null;
  }

  const file = await loadOwnedImageFile(env, userId, baseId);
  if (!file) {
    return null;
  }

  const ai = new GoogleGenAI({ apiKey });
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const contents = [
    {
      role: "user" as const,
      parts: [
        { text: VISION_PROMPT },
        {
          inlineData: {
            mimeType: file.type || "image/jpeg",
            data,
          },
        },
      ],
    },
  ];

  let lastError: unknown;
  for (const model of VISION_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          maxOutputTokens: 128,
          temperature: 0.2,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      const raw = textFromGemini(response);
      const query = normalizeLookQuery(raw);
      if (query) {
        return query;
      }
      if (raw) {
        console.warn("pexels suggest unused", raw);
      }
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) {
    console.warn(
      "pexels suggest failed",
      lastError instanceof Error ? lastError.message : lastError,
    );
  }
  return null;
}

export async function suggestLookQuery(
  env: Env,
  userId: string,
  baseId: string,
): Promise<string | null> {
  try {
    return await Promise.race([
      suggestFromVision(env, userId, baseId),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), VISION_MS);
      }),
    ]);
  } catch (error) {
    console.warn(
      "pexels suggest failed",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export async function searchLooks(input: {
  env: Env;
  userId: string;
  query: string | null;
  baseId: string | null;
}): Promise<PexelsSearchPayload> {
  const apiKey = pexelsKey(input.env);
  if (!apiKey) {
    throw new PexelsConfigError();
  }

  let suggested = false;
  let query: string | null = null;
  if (input.query) {
    query = normalizeLookQuery(input.query);
  } else if (input.baseId) {
    query = await suggestLookQuery(input.env, input.userId, input.baseId);
    suggested = Boolean(query);
  }

  if (!query) {
    return { query: "", suggested: false, photos: [] };
  }

  try {
    const photos = await searchPexelsPhotos(apiKey, query);
    return { query, suggested, photos };
  } catch (error) {
    console.warn(
      "pexels search failed",
      error instanceof Error ? error.message : error,
    );
    return { query, suggested, photos: [] };
  }
}

export class PexelsConfigError extends Error {
  constructor() {
    super("PEXELS_API_KEY is not configured.");
    this.name = "PexelsConfigError";
  }
}
