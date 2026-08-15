import { NextResponse } from "next/server";
import {
  editScene,
  imageResultToApiResponse,
  qualitySchema,
} from "@/lib/openai-images";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const sceneDataUrl = String(formData.get("scene") ?? "");
    const mask = formData.get("mask");
    const quality = qualitySchema.parse(formData.get("quality") ?? "low");
    const instructions = formData
      .getAll("instructions")
      .map((item) => String(item).trim())
      .filter(Boolean);

    if (!sceneDataUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "A current generated scene is required." }, { status: 400 });
    }

    if (!(mask instanceof File)) {
      return NextResponse.json({ error: "A brushed mask image is required." }, { status: 400 });
    }

    if (instructions.length === 0) {
      return NextResponse.json(
        { error: "Queue at least one edit instruction." },
        { status: 400 },
      );
    }

    const result = await editScene({
      sceneDataUrl,
      mask,
      instructions,
      quality,
    });

    return NextResponse.json(imageResultToApiResponse(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to edit the scene.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
