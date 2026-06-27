import {
  compositeOutsideMask,
  dilate,
  emptyMask,
  feather,
  maskBounds,
  type MaskBuffer,
} from "../lib/mask-ops-core.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}`);
  }
}

function fill(pixels: number, rgb: [number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < pixels; i += 1) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  return data;
}

function squareMask(w: number, h: number, x0: number, y0: number, x1: number, y1: number): MaskBuffer {
  const mask = emptyMask(w, h);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      mask.data[y * w + x] = 255;
    }
  }
  return mask;
}

const W = 16;
const H = 16;
const P = W * H;
const original = fill(P, [10, 20, 30]);
const edited = fill(P, [200, 100, 50]);

const hardMask = squareMask(W, H, 5, 5, 11, 11);
const composited = compositeOutsideMask(original, edited, hardMask);

let outsideIdentical = true;
let insideEdited = true;
let changedPixels = 0;
let selectedPixels = 0;
for (let i = 0; i < P; i += 1) {
  const selected = hardMask.data[i] === 255;
  if (selected) selectedPixels += 1;
  const base = i * 4;
  const matchesOriginal =
    composited[base] === original[base] &&
    composited[base + 1] === original[base + 1] &&
    composited[base + 2] === original[base + 2];
  const matchesEdited =
    composited[base] === edited[base] &&
    composited[base + 1] === edited[base + 1] &&
    composited[base + 2] === edited[base + 2];
  if (!matchesOriginal) changedPixels += 1;
  if (!selected && !matchesOriginal) outsideIdentical = false;
  if (selected && !matchesEdited) insideEdited = false;
}

check("outside the mask is byte-identical to the original", outsideIdentical);
check("inside a hard mask equals the edited image", insideEdited);
check("changed pixels exactly equal the selected region", changedPixels === selectedPixels && selectedPixels === 36);

const alpha0 = compositeOutsideMask(original, edited, emptyMask(W, H));
let allOriginal = true;
for (let i = 0; i < P * 4; i += 4) {
  if (alpha0[i] !== original[i] || alpha0[i + 1] !== original[i + 1] || alpha0[i + 2] !== original[i + 2]) {
    allOriginal = false;
    break;
  }
}
check("empty mask leaves the image 100% unchanged", allOriginal);

const grown = dilate(hardMask, 2);
const grownBounds = maskBounds(grown);
const baseBounds = maskBounds(hardMask);
check(
  "dilate expands the selection outward",
  Boolean(grownBounds && baseBounds && grownBounds.minX < baseBounds.minX && grownBounds.maxX > baseBounds.maxX),
);

const softened = feather(dilate(hardMask, 1), 2);
let hasSoftEdge = false;
let farPixelUntouched = true;
const softComposite = compositeOutsideMask(original, edited, softened);
for (let i = 0; i < P; i += 1) {
  const a = softened.data[i];
  if (a > 0 && a < 255) hasSoftEdge = true;
  const x = i % W;
  const y = Math.floor(i / W);
  const far = x === 0 || y === 0 || x === W - 1 || y === H - 1;
  const base = i * 4;
  if (far) {
    const matchesOriginal =
      softComposite[base] === original[base] &&
      softComposite[base + 1] === original[base + 1] &&
      softComposite[base + 2] === original[base + 2];
    if (!matchesOriginal) farPixelUntouched = false;
  }
}
check("feather produces a soft alpha edge", hasSoftEdge);
check("pixels far from the selection stay byte-identical even after feathering", farPixelUntouched);

if (failures > 0) {
  console.error(`\nverify-composite: ${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nverify-composite: all checks passed");
