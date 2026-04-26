import { NextResponse } from "next/server";
import {
  generateScene,
  imageResultToApiResponse,
  providerSchema,
  qualitySchema,
} from "@/lib/openai-images";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const quality = qualitySchema.parse(formData.get("quality") ?? "low");
    const provider = providerSchema.parse(formData.get("provider") ?? "openai");
    const referenceImages = formData
      .getAll("referenceImages")
      .filter((item): item is File | string => item instanceof File || typeof item === "string");
    const textHints = formData
      .getAll("textHints")
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);

    if (referenceImages.length === 0) {
      return NextResponse.json(
        { error: "Select at least one canvas image to use as a reference." },
        { status: 400 },
      );
    }

    const result = await generateScene({
      provider,
      referenceImages,
      textHints,
      quality,
    });

    return NextResponse.json(imageResultToApiResponse(result));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate the design scene.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
