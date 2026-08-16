/**
 * Copied from apps/canvas/lib/spatial-lock.ts.
 * Prompt blocks for preserving room geometry, camera, and openings.
 */

export const SPATIAL_LOCK_INSTRUCTIONS = [
  "SPATIAL LOCK — treat the base photograph as a fixed 3D volume and camera capture.",
  "Before changing anything, identify and LOCK: (1) camera position, height, lens feel, and horizon line; (2) every wall plane and corner visible; (3) the exact count, size, shape, and screen position of every window, door, arch, and opening; (4) ceiling profile, beams, and built-ins.",
  "FORBIDDEN unless the user explicitly requests a structural change: moving/adding/removing/resizing windows or doors; changing camera angle, crop, or perspective; mirroring or rotating the room; altering wall positions or ceiling height; inventing openings that are not in the base.",
  "You MAY change materials, colors, furniture, decor, and lighting mood ONLY within the user's directed regions — everything else stays pixel-true to the base layout.",
].join("\n");

export const SPATIAL_LOCK_GEMINI_ADDENDUM =
  "Use the attached base photo as ground truth for room geometry. Do not hallucinate new windows or shift the viewpoint.";

export const INPAINT_STRUCTURE_INSTRUCTIONS = [
  "Apply changes ONLY in transparent (editable) mask regions.",
  "Keep every opaque (unmasked) pixel faithful to the input: walls, window glass and frames, door frames, ceiling lines, floor edge, and camera framing must not drift.",
  "Match lighting direction and color temperature from the source photo outside the edited regions.",
].join("\n");

export function shouldUseInpaintPath(options: {
  structureLock: boolean;
  provider: "openai" | "gemini";
  hasAnnotationEdits: boolean;
  referenceCount: number;
  inspirationCount: number;
}): boolean {
  return (
    options.structureLock &&
    options.provider === "openai" &&
    options.hasAnnotationEdits &&
    options.referenceCount === 0 &&
    options.inspirationCount === 0
  );
}
