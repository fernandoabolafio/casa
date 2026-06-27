import { NextResponse } from "next/server";
import {
  editRegion,
  editSizeSchema,
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
    const instruction = String(formData.get("instruction") ?? "").trim();
    const quality = qualitySchema.parse(formData.get("quality") ?? "low");
    const size = editSizeSchema.parse(formData.get("size") ?? "1536x1024");

    if (!sceneDataUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "A base scene image is required." }, { status: 400 });
    }
    if (!(mask instanceof File)) {
      return NextResponse.json({ error: "A selection mask is required." }, { status: 400 });
    }
    if (!instruction) {
      return NextResponse.json({ error: "An edit instruction is required." }, { status: 400 });
    }

    const result = await editRegion({ sceneDataUrl, mask, instruction, quality, size });
    return NextResponse.json(imageResultToApiResponse(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to edit the object.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
