export type UploadedAsset = {
  id: string;
  file: File;
  name: string;
  previewUrl: string;
};

export type GeneratedScene = {
  id: string;
  dataUrl: string;
  prompt: string;
  createdAt: number;
  source: "generation" | "edit";
};

export type GenerationQuality = "low" | "medium" | "high" | "auto";

export type ImageProvider = "openai" | "gemini";

export type ApiSceneResponse = {
  image: string;
  mimeType: string;
  prompt?: string;
  requestId?: string;
};
