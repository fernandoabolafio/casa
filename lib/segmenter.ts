import type { MaskBuffer } from "@/lib/mask-ops-core";

const MODEL_ID = "Xenova/slimsam-77-uniform";

type TransformersModule = typeof import("@huggingface/transformers");

type LoadedModel = {
  model: Awaited<ReturnType<TransformersModule["SamModel"]["from_pretrained"]>>;
  processor: Awaited<ReturnType<TransformersModule["AutoProcessor"]["from_pretrained"]>>;
  Tensor: TransformersModule["Tensor"];
  RawImage: TransformersModule["RawImage"];
};

// transformers.js exposes these SAM-specific methods at runtime, but its
// published types only describe the generic base classes, so we narrow here.
type SamRuntimeModel = {
  get_image_embeddings: (inputs: unknown) => Promise<Record<string, unknown>>;
};

type ProcessedMask = { data: ArrayLike<number>; dims: number[] };

type SamRuntimeProcessor = {
  post_process_masks: (
    predMasks: unknown,
    originalSizes: number[][],
    reshapedSizes: number[][],
  ) => Promise<ProcessedMask[]>;
};

type PreparedImage = {
  embeddings: Record<string, unknown>;
  originalSizes: number[][];
  reshapedSizes: number[][];
  width: number;
  height: number;
};

let loadPromise: Promise<LoadedModel> | null = null;

function hasWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

async function loadModel(): Promise<LoadedModel> {
  if (!loadPromise) {
    loadPromise = (async () => {
      const transformers = await import("@huggingface/transformers");
      transformers.env.allowLocalModels = false;
      const device = hasWebGPU() ? "webgpu" : "wasm";
      const dtype = device === "webgpu" ? "fp16" : "fp32";
      const model = await transformers.SamModel.from_pretrained(MODEL_ID, {
        dtype,
        device,
        // onnxruntime logs a benign "nodes not assigned to preferred EP"
        // warning via console.error; raise the severity so it stays quiet
        // (and doesn't trip the Next.js dev error overlay).
        session_options: { logSeverityLevel: 3 },
      });
      const processor = await transformers.AutoProcessor.from_pretrained(MODEL_ID);
      return {
        model,
        processor,
        Tensor: transformers.Tensor,
        RawImage: transformers.RawImage,
      };
    })().catch((error) => {
      loadPromise = null;
      throw error;
    });
  }
  return loadPromise;
}

export type Segmenter = {
  prepare: (dataUrl: string) => Promise<void>;
  segmentAtPoint: (normX: number, normY: number) => Promise<MaskBuffer>;
};

export async function preloadSegmenter(): Promise<void> {
  await loadModel();
}

export function createSegmenter(): Segmenter {
  let prepared: PreparedImage | null = null;
  let preparePromise: Promise<void> | null = null;

  return {
    prepare(dataUrl: string) {
      preparePromise = (async () => {
        const { model, processor, RawImage } = await loadModel();
        const image = await RawImage.read(dataUrl);
        const inputs = await processor(image);
        const embeddings = await (model as unknown as SamRuntimeModel).get_image_embeddings(
          inputs,
        );
        prepared = {
          embeddings: embeddings as Record<string, unknown>,
          originalSizes: (inputs as { original_sizes: number[][] }).original_sizes,
          reshapedSizes: (inputs as { reshaped_input_sizes: number[][] }).reshaped_input_sizes,
          width: image.width,
          height: image.height,
        };
      })();
      return preparePromise;
    },

    async segmentAtPoint(normX: number, normY: number) {
      // Tolerate clicks that arrive while embeddings are still being computed.
      if (preparePromise) await preparePromise;
      if (!prepared) {
        throw new Error("Segmenter image is not prepared yet.");
      }
      const { model, processor, Tensor } = await loadModel();
      const reshaped = prepared.reshapedSizes[0];
      const points = [normX * reshaped[1], normY * reshaped[0]];
      const inputPoints = new Tensor("float32", points, [1, 1, 1, 2]);
      const inputLabels = new Tensor("int64", [1n], [1, 1, 1]);

      const outputs = await model({
        ...prepared.embeddings,
        input_points: inputPoints,
        input_labels: inputLabels,
      });

      const masks = await (processor as unknown as SamRuntimeProcessor).post_process_masks(
        outputs.pred_masks,
        prepared.originalSizes,
        prepared.reshapedSizes,
      );

      const maskTensor = masks[0];
      const [, count, height, width] = maskTensor.dims as number[];
      const scores = Array.from(outputs.iou_scores.data as ArrayLike<number>);
      let best = 0;
      for (let i = 1; i < count; i += 1) {
        if (scores[i] > scores[best]) best = i;
      }

      const source = maskTensor.data as ArrayLike<number>;
      const plane = best * height * width;
      const data = new Uint8Array(width * height);
      for (let i = 0; i < width * height; i += 1) {
        data[i] = source[plane + i] ? 255 : 0;
      }
      return { width, height, data };
    },
  };
}
