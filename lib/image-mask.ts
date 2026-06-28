import { maskMatchesImage } from "@/lib/image-mask-core";

export type MaskExport = {
  blob: Blob;
  hasPaint: boolean;
  width: number;
  height: number;
};

export function canvasHasPaint(canvas: HTMLCanvasElement): boolean {
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return false;
  }

  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, width, height).data;

  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] > 0) {
      return true;
    }
  }

  return false;
}

const ANNOTATION_DIFF_THRESHOLD = 28;
const ANNOTATION_DILATE_RADIUS = 4;

async function blobToImageData(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error("Could not read image data for the mask.");
  }

  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function pixelDiff(clean: Uint8ClampedArray, composite: Uint8ClampedArray, index: number) {
  return (
    Math.abs(clean[index] - composite[index]) +
    Math.abs(clean[index + 1] - composite[index + 1]) +
    Math.abs(clean[index + 2] - composite[index + 2])
  );
}

function dilateEditableMask(editable: boolean[], width: number, height: number, radius: number) {
  if (radius <= 0) return editable;

  const next = editable.slice();

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!editable[index]) continue;

      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          next[ny * width + nx] = true;
        }
      }
    }
  }

  return next;
}

/**
 * OpenAI edit masks: transparent = editable, opaque = preserved.
 * Diff the clean base against the annotated composite to find brush/text marks.
 */
export async function buildEditMaskFromDiff(
  cleanBlob: Blob,
  compositeBlob: Blob,
): Promise<MaskExport> {
  const [cleanData, compositeData] = await Promise.all([
    blobToImageData(cleanBlob),
    blobToImageData(compositeBlob),
  ]);

  if (
    cleanData.width !== compositeData.width ||
    cleanData.height !== compositeData.height
  ) {
    throw new Error("Clean base and annotated composite must share dimensions.");
  }

  const { width, height } = cleanData;
  const pixelCount = width * height;
  const editable = new Array<boolean>(pixelCount).fill(false);

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const index = pixel * 4;
    if (pixelDiff(cleanData.data, compositeData.data, index) > ANNOTATION_DIFF_THRESHOLD) {
      editable[pixel] = true;
    }
  }

  const dilated = dilateEditableMask(
    editable,
    width,
    height,
    ANNOTATION_DILATE_RADIUS,
  );
  const hasPaint = dilated.some(Boolean);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  const context = maskCanvas.getContext("2d");
  if (!context) {
    throw new Error("Could not create a canvas context for the edit mask.");
  }

  const maskData = context.createImageData(width, height);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const index = pixel * 4;
    if (dilated[pixel]) {
      maskData.data[index] = 0;
      maskData.data[index + 1] = 0;
      maskData.data[index + 2] = 0;
      maskData.data[index + 3] = 0;
    } else {
      maskData.data[index] = 255;
      maskData.data[index + 1] = 255;
      maskData.data[index + 2] = 255;
      maskData.data[index + 3] = 255;
    }
  }

  context.putImageData(maskData, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) => {
    maskCanvas.toBlob((result) => {
      if (result) {
        resolve(result);
        return;
      }

      reject(new Error("Could not export the edit mask as PNG."));
    }, "image/png");
  });

  return {
    blob,
    hasPaint,
    width,
    height,
  };
}

export async function exportAlphaMask(
  sourceCanvas: HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number,
): Promise<MaskExport> {
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = targetWidth;
  maskCanvas.height = targetHeight;

  const context = maskCanvas.getContext("2d");

  if (!context) {
    throw new Error("Could not create a canvas context for the mask.");
  }

  context.clearRect(0, 0, targetWidth, targetHeight);
  context.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);

  const hasPaint = canvasHasPaint(maskCanvas);

  if (
    !maskMatchesImage(
      { width: targetWidth, height: targetHeight },
      { width: maskCanvas.width, height: maskCanvas.height },
    )
  ) {
    throw new Error("Mask dimensions must match the source scene.");
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    maskCanvas.toBlob((result) => {
      if (result) {
        resolve(result);
        return;
      }

      reject(new Error("Could not export the mask as PNG."));
    }, "image/png");
  });

  return {
    blob,
    hasPaint,
    width: targetWidth,
    height: targetHeight,
  };
}
