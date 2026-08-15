import type { GalleryImage } from "~/lib/images.server";

type UploadResponse = {
  image?: GalleryImage;
  error?: string;
};

export async function uploadImage(file: File): Promise<GalleryImage> {
  const body = new FormData();
  body.set("file", file);

  const response = await fetch("/api/images", {
    method: "POST",
    credentials: "include",
    body,
  });

  const payload = (await response.json()) as UploadResponse;
  if (!response.ok || !payload.image) {
    throw new Error(payload.error ?? "Upload failed.");
  }
  return payload.image;
}
