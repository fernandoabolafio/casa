import OpenAI, { toFile } from "openai";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

export const qualitySchema = z.enum(["low", "medium", "high", "auto"]);
export const providerSchema = z.enum(["openai", "gemini"]);
export const editSizeSchema = z.enum(["1024x1024", "1536x1024", "1024x1536"]);

export type EditSize = z.infer<typeof editSizeSchema>;

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
  references?: SceneReference[];
  inspirations?: SceneReference[];
  direction?: string;
};

const SYSTEM_PREAMBLE =
  "You are an interior designer producing a single new photorealistic interior scene. Read every text block before its associated image carefully — text blocks describe how to use the image that immediately follows them. Items drawn or written directly on top of any image (brush strokes, highlights, arrows, short text notes) are targeted design directives for that exact region; do not depict the marks themselves in the output, but apply the intent they convey.\n\nANNOTATION LEGEND (apply consistently to every image):\n- A cross, X mark, strike-through, or scribble drawn over an object means: REMOVE that object from the scene (do not replace it with a similar item unless an additional note explicitly says so).\n- A circle, ellipse, oval, loose loop, underline, or bracket around an object means: KEEP that object — preserve its identity, position, and visual character. Treat it as locked content, even when other elements of the scene are restyled.\n- A scribble, brush stroke, fill, or color wash applied across a surface (wall, ceiling, floor, cabinetry, large furniture face, curtains, rug, etc.) is a COLOR HINT for that surface: render that surface in the same color FAMILY as the mark (e.g. a green scribble on a wall ⇒ a green wall; a blue scribble on a sofa ⇒ a blue sofa). Do NOT copy the exact pigment, opacity, stroke pattern, or texture of the mark — instead choose the precise tone, saturation, and finish that best fits the requested style and any inspirations (matte, glossy, lime-washed, painted, wallpapered, upholstery weave, etc., as appropriate). Apply the color cleanly and uniformly to the whole surface, never as a visible scribble or partial swatch.\n- If the same region has both a keep mark and a written instruction, follow the instruction while still keeping the highlighted object. If a written note specifies an exact color, finish, or material, the note overrides the inferred tone of any color hint in that region.\nNever render the annotation marks (crosses, circles, arrows, written notes, brush strokes, color washes) in the final image.";

const BASE_INSTRUCTIONS =
  "BASE IMAGE — the room to redesign. PRESERVE its room structure: geometry, walls, windows, doors, ceiling height, perspective, camera angle, daylight direction, and overall layout. Treat walls, windows, doors, openings, ceiling lines, and other architectural elements as locked to the base scene unless the user explicitly instructs a structural change. Treat any annotations on this image as targeted edits to apply in those specific regions.";

const BASE_ONLY_AMENDMENT =
  "MINIMAL-EDIT MODE — no design references or inspirations were provided, only this base image. Treat the base as a near-final scene and change ONLY what the annotations on the base unambiguously direct you to change, plus anything explicitly requested in the USER DIRECTION (if any). Do NOT restyle, recolor, relight, redecorate, reorganize, or substitute any other element. Every wall, ceiling, floor, window treatment, piece of furniture, textile, decor item, plant, lamp, artwork, hardware finish, and lighting condition that is NOT directly targeted by an annotation or by the user direction must be reproduced as faithfully as possible — same colors, same materials, same positions, same proportions, same camera framing. When in doubt about whether something should change, leave it exactly as it is in the base.";

const BASE_EXTEND_AMENDMENT =
  "EXTEND MODE — the base shows a DIFFERENT CAMERA ANGLE / VIEWPOINT of the SAME PHYSICAL ROOM that appears in the design references below. Preserve the base's geometry, perspective, and which surfaces are visible from this angle, but identify which walls, floor sections, doors, windows, and pieces of furniture in the base correspond to those in the references and finish them IDENTICALLY (same paint color, same wood tone, same upholstery, same materials, same lighting temperature). Out-of-frame elements that are present in references but not in this base view should be omitted; new elements visible from this angle that are absent from the references should be inferred coherently with the established design.";

const REFERENCE_INSTRUCTIONS =
  "DESIGN REFERENCES — these are prior renders (or photographs) of the SAME room that the base belongs to. Treat them as the LOCKED design state of the room. Identify every concrete design decision they show — wall paint colors and finishes, ceiling treatment, flooring material and direction, the specific sofa / chairs / tables / beds / lamps / rugs / curtains / artwork / plants / hardware, the specific materials and textures, the lighting temperature and intensity — and reproduce the SAME items and finishes in the new view. Match colors as closely as possible (same paint family, same wood tone, same fabric). Do NOT redesign or substitute these elements. Annotations on a reference clarify which elements matter most or are non-negotiable.";

const INSPIRATION_INSTRUCTIONS =
  "STYLE INSPIRATIONS — borrow ONLY their aesthetic, color palette, materials, finishes, lighting mood, furniture silhouettes, and decor language. Do NOT copy their geometry, layout, perspective, or specific room contents. Annotations on an inspiration image highlight the qualities the user wants borrowed.";

const STYLE_ONLY_INSTRUCTIONS =
  "No base room was provided. Synthesize a new coherent interior scene that captures the combined aesthetic of the inspirations.";

const FINAL_INSTRUCTIONS =
  "Produce a single new photorealistic interior scene that satisfies the directives above. Conflict resolution: BASE wins on geometry/perspective; DESIGN REFERENCES win on color, material, and specific furnishings; INSPIRATIONS only fill gaps the base and references do not resolve; the USER DIRECTION overrides specific items it names. Do not render the annotation marks themselves in the output.";

function formatHintsBlock(label: string, hints: string[]): string | null {
  if (hints.length === 0) return null;
  return [
    `${label}:`,
    ...hints.map((hint, index) => `  ${index + 1}. ${hint}`),
  ].join("\n");
}

export async function generateScene(request: SceneRequest) {
  const inspirations = request.inspirations ?? [];
  const references = request.references ?? [];

  if (!request.base && inspirations.length === 0 && references.length === 0) {
    throw new Error(
      "Provide a base image, a design reference, or at least one inspiration.",
    );
  }

  if (request.provider === "gemini") {
    return generateSceneWithGemini(request);
  }

  return generateSceneWithOpenAI(request);
}

type OpenAIContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "high" };

async function imageToOpenAIPart(
  image: File | string,
): Promise<OpenAIContentPart> {
  return {
    type: "input_image",
    image_url: image instanceof File ? await fileToDataUrl(image) : image,
    detail: "high",
  };
}

async function buildOpenAIContent(request: SceneRequest): Promise<OpenAIContentPart[]> {
  const inspirations = request.inspirations ?? [];
  const references = request.references ?? [];
  const hasReferences = references.length > 0;
  const parts: OpenAIContentPart[] = [{ type: "input_text", text: SYSTEM_PREAMBLE }];

  if (request.base) {
    const baseLines = [BASE_INSTRUCTIONS];
    if (hasReferences) baseLines.push(BASE_EXTEND_AMENDMENT);
    if (!hasReferences && inspirations.length === 0) baseLines.push(BASE_ONLY_AMENDMENT);
    const hintBlock = formatHintsBlock("Annotations on the base", request.base.hints);
    if (hintBlock) baseLines.push(hintBlock);
    parts.push({ type: "input_text", text: baseLines.join("\n\n") });
    parts.push(await imageToOpenAIPart(request.base.image));
  }

  if (hasReferences) {
    parts.push({ type: "input_text", text: REFERENCE_INSTRUCTIONS });

    for (const [index, reference] of references.entries()) {
      const headerLines = [`Design reference #${index + 1}:`];
      const hintBlock = formatHintsBlock(
        "Locked elements / clarifications",
        reference.hints,
      );
      if (hintBlock) headerLines.push(hintBlock);
      parts.push({ type: "input_text", text: headerLines.join("\n") });
      parts.push(await imageToOpenAIPart(reference.image));
    }
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
      parts.push(await imageToOpenAIPart(inspiration.image));
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
  const references = request.references ?? [];
  const hasReferences = references.length > 0;
  const parts: GeminiPart[] = [{ text: SYSTEM_PREAMBLE }];

  if (request.base) {
    const baseLines = [BASE_INSTRUCTIONS];
    if (hasReferences) baseLines.push(BASE_EXTEND_AMENDMENT);
    if (!hasReferences && inspirations.length === 0) baseLines.push(BASE_ONLY_AMENDMENT);
    const hintBlock = formatHintsBlock("Annotations on the base", request.base.hints);
    if (hintBlock) baseLines.push(hintBlock);
    parts.push({ text: baseLines.join("\n\n") });
    parts.push({ inlineData: await referenceToInlineData(request.base.image) });
  }

  if (hasReferences) {
    parts.push({ text: REFERENCE_INSTRUCTIONS });

    for (const [index, reference] of references.entries()) {
      const headerLines = [`Design reference #${index + 1}:`];
      const hintBlock = formatHintsBlock(
        "Locked elements / clarifications",
        reference.hints,
      );
      if (hintBlock) headerLines.push(hintBlock);
      parts.push({ text: headerLines.join("\n") });
      parts.push({ inlineData: await referenceToInlineData(reference.image) });
    }
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

export async function editRegion({
  sceneDataUrl,
  mask,
  instruction,
  quality,
  size,
}: {
  sceneDataUrl: string;
  mask: File;
  instruction: string;
  quality: ImageQuality;
  size: EditSize;
}) {
  const openai = getOpenAIClient();
  const scene = dataUrlToBuffer(sceneDataUrl);
  const sceneFile = await toFile(scene.buffer, "scene.png", { type: scene.mimeType });
  const maskFile = await toFile(Buffer.from(await mask.arrayBuffer()), "mask.png", {
    type: "image/png",
  });

  const prompt = [
    "You are editing one selected object in an interior photo. Only the transparent region of the mask may change.",
    "Keep the room geometry, camera angle, perspective, lighting direction, and every unmasked pixel exactly as they are.",
    instruction,
  ].join("\n");

  const response = await openai.images.edit({
    model: "gpt-image-2",
    image: sceneFile,
    mask: maskFile,
    prompt,
    quality,
    size,
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
