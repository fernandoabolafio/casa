export const PRODUCT_NAME = "See your room";

export const PRODUCT_LINE =
  "See your room with the new sofa. Then keep going.";

export const wordmarkClass =
  "font-serif text-sm tracking-wide text-[var(--ink)]";

export const headingClass = "font-serif font-semibold tracking-tight";

export function roomDownloadName(jobId: string): string {
  return `see-your-room-${jobId}.png`;
}
