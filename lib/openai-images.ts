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

function buildPrompt(textHints: string[]) {
  const promptLines = [
    "You are an interior designer generating a coherent photorealistic room concept.",
    "Each reference image already contains visual annotations drawn on top of it: brush strokes, highlights, arrows, shapes, and short text notes are design directives the user wants you to honor in those exact regions (for example, a brush over a pillow with the note 'make it red' means recolor that pillow red).",
    "Treat the underlying photo as the source of truth for geometry, perspective, and unmarked areas. Apply the annotations as targeted edits, ignoring the marks themselves visually but acting on the intent they convey.",
    "When multiple references are provided, synthesize them into a single coherent scene; respect floor plans or room structure where present and let style/material/furniture references guide the rest.",
  ];

  if (textHints.length > 0) {
    promptLines.push(
      "Explicit textual notes from the canvas (treat as additional directives for the corresponding annotated regions):",
      ...textHints.map((hint, index) => `${index + 1}. ${hint}`),
    );
  }

  return promptLines.join("\n");
}

export async function generateScene({
  provider,
  referenceImages,
  textHints = [],
  quality,
}: {
  provider: ImageProvider;
  referenceImages: Array<File | string>;
  textHints?: string[];
  quality: ImageQuality;
}) {
  if (provider === "gemini") {
    return generateSceneWithGemini({ referenceImages, textHints });
  }

  return generateSceneWithOpenAI({ referenceImages, textHints, quality });
}

async function generateSceneWithOpenAI({
  referenceImages,
  textHints,
  quality,
}: {
  referenceImages: Array<File | string>;
  textHints: string[];
  quality: ImageQuality;
}) {
  const openai = getOpenAIClient();
  const referenceInputs = await Promise.all(
    referenceImages.map(async (image) => ({
      type: "input_image" as const,
      image_url: image instanceof File ? await fileToDataUrl(image) : image,
      detail: "high" as const,
    })),
  );

  const response = await openai.responses.create({
    model: "gpt-5.5",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: buildPrompt(textHints) },
          ...referenceInputs,
        ],
      },
    ],
    tools: [
      {
        type: "image_generation",
        action: "generate",
        quality,
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

async function generateSceneWithGemini({
  referenceImages,
  textHints,
}: {
  referenceImages: Array<File | string>;
  textHints: string[];
}): Promise<GeneratedImageResult> {
  const ai = getGeminiClient();
  const inlineParts = await Promise.all(
    referenceImages.map(async (image) => ({
      inlineData: await referenceToInlineData(image),
    })),
  );

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents: [
      {
        role: "user",
        parts: [{ text: buildPrompt(textHints) }, ...inlineParts],
      },
    ],
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  let imageBase64: string | undefined;
  let revisedPrompt: string | undefined;

  for (const part of parts) {
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
