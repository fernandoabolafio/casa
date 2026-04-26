import { NextResponse } from "next/server";
import {
  generateScene,
  imageResultToApiResponse,
  providerSchema,
  qualitySchema,
} from "@/lib/openai-images";

export const runtime = "nodejs";
export const maxDuration = 120;

function parseHintArray(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  } catch {
    // ignore malformed payloads
  }
  return [];
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const quality = qualitySchema.parse(formData.get("quality") ?? "low");
    const provider = providerSchema.parse(formData.get("provider") ?? "openai");
    const direction = String(formData.get("direction") ?? "").trim();

    const baseImageEntry = formData.get("baseImage");
    const baseImage =
      baseImageEntry instanceof File || typeof baseImageEntry === "string"
        ? baseImageEntry
        : null;
    const baseHints = formData
      .getAll("baseHints")
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);

    const inspirationFiles = formData
      .getAll("inspirationImages")
      .filter((item): item is File | string =>
        item instanceof File || typeof item === "string",
      );
    const inspirationHintArrays = formData
      .getAll("inspirationHints")
      .map(parseHintArray);

    const inspirations = inspirationFiles.map((image, index) => ({
      image,
      hints: inspirationHintArrays[index] ?? [],
    }));

    const referenceFiles = formData
      .getAll("referenceImages")
      .filter((item): item is File | string =>
        item instanceof File || typeof item === "string",
      );
    const referenceHintArrays = formData
      .getAll("referenceHints")
      .map(parseHintArray);

    const references = referenceFiles.map((image, index) => ({
      image,
      hints: referenceHintArrays[index] ?? [],
    }));

    if (!baseImage && inspirations.length === 0 && references.length === 0) {
      return NextResponse.json(
        {
          error:
            "Pin a base image or select at least one inspiration before generating.",
        },
        { status: 400 },
      );
    }

    const result = await generateScene({
      provider,
      quality,
      direction: direction || undefined,
      base: baseImage ? { image: baseImage, hints: baseHints } : null,
      references,
      inspirations,
    });

    return NextResponse.json(imageResultToApiResponse(result));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate the design scene.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
