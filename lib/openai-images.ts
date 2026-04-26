import OpenAI, { toFile } from "openai";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

export const qualitySchema = z.enum(["low", "medium", "high", "auto"]);
export const providerSchema = z.enum(["openai", "gemini"]);

export type ImageProvider = z.infer<typeof providerSchema>;

const imageOutputSchema = z.object({
  type: z.literal("image_generation_call"),
  result: z.string().optional(),
  revised_prompt: z.string().optional(),
});

const responseSchema = z.object({
  id: z.string().optional(),
  output: z.array(z.unknown()).optional(),
});

export type ImageQuality = z.infer<typeof qualitySchema>;

export type GeneratedImageResult = {
  imageBase64: string;
  mimeType: "image/png";
  revisedPrompt?: string;
  requestId?: string;
};

export function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

export async function fileToDataUrl(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "image/png";

  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export function dataUrlToBuffer(dataUrl: string) {
  const match = dataUrl.match(/^data:(?<mimeType>[^;]+);base64,(?<data>.+)$/);

  if (!match?.groups?.data || !match.groups.mimeType) {
    throw new Error("Expected a base64 data URL.");
  }

  return {
    buffer: Buffer.from(match.groups.data, "base64"),
    mimeType: match.groups.mimeType,
  };
}

export function extractImageFromResponse(response: unknown): GeneratedImageResult {
  const parsed = responseSchema.parse(response);
  const imageOutput = parsed.output
    ?.map((item) => imageOutputSchema.safeParse(item))
    .find((item) => item.success && item.data.result);

  if (!imageOutput?.success || !imageOutput.data.result) {
    throw new Error("OpenAI did not return an image result.");
  }

  return {
    imageBase64: imageOutput.data.result,
    mimeType: "image/png",
    revisedPrompt: imageOutput.data.revised_prompt,
    requestId: parsed.id,
  };
}

export type SceneReference = {
  image: File | string;
  hints: string[];
};

export type SceneRequest = {
  provider: ImageProvider;
  quality: ImageQuality;
  base?: SceneReference | null;
  inspirations?: SceneReference[];
  direction?: string;
};

const SYSTEM_PREAMBLE =
  "You are an interior designer producing a single new photorealistic interior scene. Read every text block before its associated image carefully — text blocks describe how to use the image that immediately follows them. Items drawn or written directly on top of any image (brush strokes, highlights, arrows, short text notes) are targeted design directives for that exact region; do not depict the marks themselves in the output, but apply the intent they convey.";

const BASE_INSTRUCTIONS =
  "BASE IMAGE — the room to redesign. PRESERVE its geometry, walls, windows, doors, ceiling height, perspective, camera angle, daylight direction, and overall layout. Treat any annotations on this image as targeted edits to apply in those specific regions.";

const INSPIRATION_INSTRUCTIONS =
  "STYLE INSPIRATIONS — borrow ONLY their aesthetic, color palette, materials, finishes, lighting mood, furniture silhouettes, and decor language. Do NOT copy their geometry, layout, perspective, or specific room contents. Annotations on an inspiration image highlight the qualities the user wants borrowed.";

const STYLE_ONLY_INSTRUCTIONS =
  "No base room was provided. Synthesize a new coherent interior scene that captures the combined aesthetic of the inspirations.";

const FINAL_INSTRUCTIONS =
  "Produce a single new photorealistic interior scene that satisfies the directives above. Do not render the annotation marks themselves in the output.";

function formatHintsBlock(label: string, hints: string[]): string | null {
  if (hints.length === 0) return null;
  return [
    `${label}:`,
    ...hints.map((hint, index) => `  ${index + 1}. ${hint}`),
  ].join("\n");
}

export async function generateScene(request: SceneRequest) {
  const inspirations = request.inspirations ?? [];

  if (!request.base && inspirations.length === 0) {
    throw new Error("Provide a base image or at least one inspiration.");
  }

  if (request.provider === "gemini") {
    return generateSceneWithGemini(request);
  }

  return generateSceneWithOpenAI(request);
}

type OpenAIContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "high" };

async function buildOpenAIContent(request: SceneRequest): Promise<OpenAIContentPart[]> {
  const inspirations = request.inspirations ?? [];
  const parts: OpenAIContentPart[] = [{ type: "input_text", text: SYSTEM_PREAMBLE }];

  if (request.base) {
    const text = [BASE_INSTRUCTIONS, formatHintsBlock("Annotations on the base", request.base.hints)]
      .filter(Boolean)
      .join("\n");
    parts.push({ type: "input_text", text });
    parts.push({
      type: "input_image",
      image_url:
        request.base.image instanceof File
          ? await fileToDataUrl(request.base.image)
          : request.base.image,
      detail: "high",
    });
  }

  if (inspirations.length > 0) {
    parts.push({
      type: "input_text",
      text: request.base ? INSPIRATION_INSTRUCTIONS : STYLE_ONLY_INSTRUCTIONS,
    });

    for (const [index, inspiration] of inspirations.entries()) {
      const headerLines = [`Inspiration #${index + 1}:`];
      const hintBlock = formatHintsBlock("What to borrow", inspiration.hints);
      if (hintBlock) headerLines.push(hintBlock);
      parts.push({ type: "input_text", text: headerLines.join("\n") });
      parts.push({
        type: "input_image",
        image_url:
          inspiration.image instanceof File
            ? await fileToDataUrl(inspiration.image)
            : inspiration.image,
        detail: "high",
      });
    }
  }

  if (request.direction && request.direction.trim()) {
    parts.push({
      type: "input_text",
      text: `USER DIRECTION (overarching guidance): ${request.direction.trim()}`,
    });
  }

  parts.push({ type: "input_text", text: FINAL_INSTRUCTIONS });

  return parts;
}

async function generateSceneWithOpenAI(request: SceneRequest) {
  const openai = getOpenAIClient();
  const content = await buildOpenAIContent(request);

  const response = await openai.responses.create({
    model: "gpt-5.5",
    input: [{ role: "user", content }],
    tools: [
      {
        type: "image_generation",
        action: "generate",
        quality: request.quality,
        size: "1536x1024",
        output_format: "png",
      },
    ],
  });

  return extractImageFromResponse(response);
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  return new GoogleGenAI({ apiKey });
}

async function referenceToInlineData(image: File | string) {
  if (image instanceof File) {
    const buffer = Buffer.from(await image.arrayBuffer());
    return {
      mimeType: image.type || "image/png",
      data: buffer.toString("base64"),
    };
  }

  const { buffer, mimeType } = dataUrlToBuffer(image);
  return { mimeType, data: buffer.toString("base64") };
}

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

async function buildGeminiParts(request: SceneRequest): Promise<GeminiPart[]> {
  const inspirations = request.inspirations ?? [];
  const parts: GeminiPart[] = [{ text: SYSTEM_PREAMBLE }];

  if (request.base) {
    const text = [BASE_INSTRUCTIONS, formatHintsBlock("Annotations on the base", request.base.hints)]
      .filter(Boolean)
      .join("\n");
    parts.push({ text });
    parts.push({ inlineData: await referenceToInlineData(request.base.image) });
  }

  if (inspirations.length > 0) {
    parts.push({
      text: request.base ? INSPIRATION_INSTRUCTIONS : STYLE_ONLY_INSTRUCTIONS,
    });

    for (const [index, inspiration] of inspirations.entries()) {
      const headerLines = [`Inspiration #${index + 1}:`];
      const hintBlock = formatHintsBlock("What to borrow", inspiration.hints);
      if (hintBlock) headerLines.push(hintBlock);
      parts.push({ text: headerLines.join("\n") });
      parts.push({ inlineData: await referenceToInlineData(inspiration.image) });
    }
  }

  if (request.direction && request.direction.trim()) {
    parts.push({
      text: `USER DIRECTION (overarching guidance): ${request.direction.trim()}`,
    });
  }

  parts.push({ text: FINAL_INSTRUCTIONS });

  return parts;
}

async function generateSceneWithGemini(
  request: SceneRequest,
): Promise<GeneratedImageResult> {
  const ai = getGeminiClient();
  const parts = await buildGeminiParts(request);

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents: [{ role: "user", parts }],
  });

  const responseParts = response.candidates?.[0]?.content?.parts ?? [];
  let imageBase64: string | undefined;
  let revisedPrompt: string | undefined;

  for (const part of responseParts) {
    if (part.inlineData?.data && !imageBase64) {
      imageBase64 = part.inlineData.data;
    } else if (part.text && !revisedPrompt) {
      revisedPrompt = part.text;
    }
  }

  if (!imageBase64) {
    throw new Error("Gemini did not return an image result.");
  }

  return {
    imageBase64,
    mimeType: "image/png",
    revisedPrompt,
    requestId: response.responseId,
  };
}

export async function editScene({
  sceneDataUrl,
  mask,
  instructions,
  quality,
}: {
  sceneDataUrl: string;
  mask: File;
  instructions: string[];
  quality: ImageQuality;
}) {
  const openai = getOpenAIClient();
  const scene = dataUrlToBuffer(sceneDataUrl);
  const sceneFile = await toFile(scene.buffer, "current-scene.png", {
    type: scene.mimeType,
  });
  const maskFile = await toFile(Buffer.from(await mask.arrayBuffer()), "mask.png", {
    type: "image/png",
  });
  const prompt = [
    "Apply the following interior design refinements to the brushed region.",
    "Keep the room geometry, perspective, lighting direction, and unmasked areas as consistent as possible.",
    ...instructions.map((instruction, index) => `${index + 1}. ${instruction}`),
  ].join("\n");

  const response = await openai.images.edit({
    model: "gpt-image-2",
    image: sceneFile,
    mask: maskFile,
    prompt,
    quality,
    size: "1536x1024",
    output_format: "png",
  });

  const imageBase64 = response.data?.[0]?.b64_json;

  if (!imageBase64) {
    throw new Error("OpenAI did not return an edited image.");
  }

  return {
    imageBase64,
    mimeType: "image/png" as const,
    requestId: response.created ? String(response.created) : undefined,
  };
}

export function imageResultToApiResponse(result: GeneratedImageResult) {
  return {
    image: `data:${result.mimeType};base64,${result.imageBase64}`,
    mimeType: result.mimeType,
    prompt: result.revisedPrompt,
    requestId: result.requestId,
  };
}
