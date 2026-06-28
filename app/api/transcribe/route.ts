import { NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/transcribe";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File) || audio.size === 0) {
      return NextResponse.json(
        { error: "No audio file was provided." },
        { status: 400 },
      );
    }

    const text = await transcribeAudio(audio);

    return NextResponse.json({ text });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to transcribe audio.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
