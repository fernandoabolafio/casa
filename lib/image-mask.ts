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
