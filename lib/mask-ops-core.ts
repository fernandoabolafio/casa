export type MaskBuffer = {
  width: number;
  height: number;
  data: Uint8Array;
};

export function emptyMask(width: number, height: number): MaskBuffer {
  return { width, height, data: new Uint8Array(width * height) };
}

export function dilate(mask: MaskBuffer, radius: number): MaskBuffer {
  if (radius <= 0) return { ...mask, data: mask.data.slice() };
  const { width, height, data } = mask;
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let max = 0;
      for (let dy = -radius; dy <= radius && max < 255; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const v = data[ny * width + nx];
          if (v > max) max = v;
          if (max === 255) break;
        }
      }
      out[y * width + x] = max;
    }
  }
  return { width, height, data: out };
}

export function feather(mask: MaskBuffer, radius: number): MaskBuffer {
  if (radius <= 0) return { ...mask, data: mask.data.slice() };
  const { width, height, data } = mask;
  const horizontal = new Float32Array(width * height);
  const window = radius * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let x = -radius; x <= radius; x += 1) {
      const cx = Math.min(width - 1, Math.max(0, x));
      sum += data[y * width + cx];
    }
    for (let x = 0; x < width; x += 1) {
      horizontal[y * width + x] = sum / window;
      const outX = Math.min(width - 1, Math.max(0, x - radius));
      const inX = Math.min(width - 1, Math.max(0, x + radius + 1));
      sum += data[y * width + inX] - data[y * width + outX];
    }
  }

  const out = new Uint8Array(width * height);
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -radius; y <= radius; y += 1) {
      const cy = Math.min(height - 1, Math.max(0, y));
      sum += horizontal[cy * width + x];
    }
    for (let y = 0; y < height; y += 1) {
      out[y * width + x] = Math.round(sum / window);
      const outY = Math.min(height - 1, Math.max(0, y - radius));
      const inY = Math.min(height - 1, Math.max(0, y + radius + 1));
      sum += horizontal[inY * width + x] - horizontal[outY * width + x];
    }
  }
  return { width, height, data: out };
}

/**
 * final = original where mask alpha is 0, edited where alpha is 255, blended in between.
 * Integer math is chosen so alpha 0 reproduces the original byte-for-byte: that exactness
 * is the anti-randomness guarantee the whole product rests on.
 */
export function compositeOutsideMask(
  original: Uint8ClampedArray | Uint8Array,
  edited: Uint8ClampedArray | Uint8Array,
  mask: MaskBuffer,
): Uint8ClampedArray {
  const pixels = mask.width * mask.height;
  if (original.length !== pixels * 4 || edited.length !== pixels * 4) {
    throw new Error("compositeOutsideMask: image buffers must match the mask size in RGBA.");
  }
  const out = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < pixels; i += 1) {
    const a = mask.data[i];
    const inv = 255 - a;
    const base = i * 4;
    for (let c = 0; c < 3; c += 1) {
      out[base + c] = (original[base + c] * inv + edited[base + c] * a + 127) / 255;
    }
    out[base + 3] = 255;
  }
  return out;
}

export function maskBounds(mask: MaskBuffer): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  const { width, height, data } = mask;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[y * width + x] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY };
}
