import { getOpenAIClient } from "@/lib/openai-images";

const TRANSCRIPTION_MODEL = "whisper-1";
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const TRANSCRIPTION_PROMPT =
  "Interior design and home decor directions, furniture, lighting, colors, and room styling.";

export async function transcribeAudio(audio: File): Promise<string> {
  if (audio.size === 0) {
    throw new Error("The recording was empty.");
  }

  if (audio.size > MAX_AUDIO_BYTES) {
    throw new Error("Recording is too long. Try a shorter clip (under 25 MB).");
  }

  const openai = getOpenAIClient();
  const transcription = await openai.audio.transcriptions.create({
    file: audio,
    model: TRANSCRIPTION_MODEL,
    prompt: TRANSCRIPTION_PROMPT,
  });

  const text = transcription.text.trim();
  if (!text) {
    throw new Error("No speech was detected in the recording.");
  }

  return text;
}
