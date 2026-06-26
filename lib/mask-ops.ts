import {
  compositeOutsideMask,
  emptyMask,
  type MaskBuffer,
} from "@/lib/mask-ops-core";
import type { EditSize } from "@/lib/openai-images";

export const EDIT_SIZES: Array<{ size: EditSize; width: number; height: number }> = [
  { size: "1024x1024", width: 1024, height: 1024 },
  { size: "1536x1024", width: 1536, height: 1024 },
  { size: "1024x1536", width: 1024, height: 1536 },
];

export function pickEditSize(width: number, height: number) {
  const aspect = width / height;
  let best = EDIT_SIZES[0];
  let bestDelta = Infinity;
  for (const candidate of EDIT_SIZES) {
    const delta = Math.abs(candidate.width / candidate.height - aspect);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = candidate;
    }
  }
  return best;
}

export function dataUrlToImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image."));
    image.src = dataUrl;
  });
}

function canvas2d(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not create a 2D canvas context.");
  return { canvas, context };
}

/** Cover-fit the source into width x height (minimal crop), returning a PNG data URL. */
export async function coverResizeToDataUrl(
  dataUrl: string,
  width: number,
  height: number,
): Promise<string> {
  const image = await dataUrlToImage(dataUrl);
  const { canvas, context } = canvas2d(width, height);
  const scale = Math.max(width / image.width, height / image.height);
  const drawW = image.width * scale;
  const drawH = image.height * scale;
  context.drawImage(image, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
  return canvas.toDataURL("image/png");
}

export async function getRGBA(
  dataUrl: string,
  width: number,
  height: number,
): Promise<Uint8ClampedArray> {
  const image = await dataUrlToImage(dataUrl);
  const { context } = canvas2d(width, height);
  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}

/** OpenAI image edits treat transparent pixels as the editable region. */
export async function maskToOpenAIPngBlob(mask: MaskBuffer): Promise<Blob> {
  const { canvas, context } = canvas2d(mask.width, mask.height);
  const image = context.createImageData(mask.width, mask.height);
  for (let i = 0; i < mask.width * mask.height; i += 1) {
    const selected = mask.data[i] > 127;
    image.data[i * 4] = 0;
    image.data[i * 4 + 1] = 0;
    image.data[i * 4 + 2] = 0;
    image.data[i * 4 + 3] = selected ? 0 : 255;
  }
  context.putImageData(image, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not export the mask PNG."));
    }, "image/png");
  });
}

export function rgbaToDataUrl(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): string {
  const { canvas, context } = canvas2d(width, height);
  const image = context.createImageData(width, height);
  image.data.set(rgba);
  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

export function compositeToDataUrl(
  original: Uint8ClampedArray,
  edited: Uint8ClampedArray,
  mask: MaskBuffer,
): string {
  const composited = compositeOutsideMask(original, edited, mask);
  return rgbaToDataUrl(composited, mask.width, mask.height);
}

/**
 * Highlights every pixel that actually changed between two RGBA buffers, so the
 * review can prove that only the intended region moved. Returns a transparent
 * overlay (changed pixels tinted) plus the changed fraction of the image.
 */
export function diffOverlayDataUrl(
  before: Uint8ClampedArray | Uint8Array,
  after: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  rgb: [number, number, number] = [231, 76, 60],
  threshold = 8,
): { overlayUrl: string; changedPct: number } {
  const pixels = width * height;
  const { canvas, context } = canvas2d(width, height);
  const image = context.createImageData(width, height);
  let changed = 0;
  for (let i = 0; i < pixels; i += 1) {
    const base = i * 4;
    const delta =
      Math.abs(before[base] - after[base]) +
      Math.abs(before[base + 1] - after[base + 1]) +
      Math.abs(before[base + 2] - after[base + 2]);
    const isChanged = delta > threshold;
    if (isChanged) changed += 1;
    image.data[base] = rgb[0];
    image.data[base + 1] = rgb[1];
    image.data[base + 2] = rgb[2];
    image.data[base + 3] = isChanged ? 150 : 0;
  }
  context.putImageData(image, 0, 0);
  return {
    overlayUrl: canvas.toDataURL("image/png"),
    changedPct: pixels === 0 ? 0 : (changed / pixels) * 100,
  };
}

/** A translucent colored overlay of the selection, for display on the stage. */
export function maskToOverlayDataUrl(
  mask: MaskBuffer,
  rgb: [number, number, number],
): string {
  const { canvas, context } = canvas2d(mask.width, mask.height);
  const image = context.createImageData(mask.width, mask.height);
  for (let i = 0; i < mask.width * mask.height; i += 1) {
    const a = mask.data[i];
    image.data[i * 4] = rgb[0];
    image.data[i * 4 + 1] = rgb[1];
    image.data[i * 4 + 2] = rgb[2];
    image.data[i * 4 + 3] = a > 127 ? 150 : 0;
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

export function rectMask(
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): MaskBuffer {
  const mask = emptyMask(width, height);
  const left = Math.max(0, Math.min(x0, x1));
  const right = Math.min(width, Math.max(x0, x1));
  const top = Math.max(0, Math.min(y0, y1));
  const bottom = Math.min(height, Math.max(y0, y1));
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      mask.data[y * width + x] = 255;
    }
  }
  return mask;
}
