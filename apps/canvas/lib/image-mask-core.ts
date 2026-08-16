export type ImageDimensions = {
  width: number;
  height: number;
};

export function maskMatchesImage(
  image: ImageDimensions,
  mask: ImageDimensions,
): boolean {
  return image.width === mask.width && image.height === mask.height;
}
