async function fetchImageBlob(imageUrl: string): Promise<Blob> {
  const response = await fetch(imageUrl, { credentials: "include" });
  if (!response.ok) {
    throw new Error("Could not load the image.");
  }
  return response.blob();
}

export async function downloadImage(
  imageUrl: string,
  filename: string,
): Promise<void> {
  const blob = await fetchImageBlob(imageUrl);
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(href);
}

export async function shareResult(input: {
  pageUrl: string;
  imageUrl: string;
  filename: string;
  title: string;
}): Promise<"shared" | "copied" | "downloaded"> {
  const blob = await fetchImageBlob(input.imageUrl);
  const type = blob.type || "image/png";
  const file = new File([blob], input.filename, { type });

  if (typeof navigator.share === "function") {
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: input.title,
        });
        return "shared";
      }
      await navigator.share({
        title: input.title,
        url: input.pageUrl,
      });
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return "shared";
      }
    }
  }

  try {
    await navigator.clipboard.writeText(input.pageUrl);
    return "copied";
  } catch {
    await downloadImage(input.imageUrl, input.filename);
    return "downloaded";
  }
}
