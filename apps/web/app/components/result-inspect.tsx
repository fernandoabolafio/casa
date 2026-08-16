import { useState, type ReactNode } from "react";
import { Link } from "react-router";

import { jobTitle, primaryActionClass } from "~/lib/compose";
import type { GalleryImage } from "~/lib/images.server";
import { downloadImage, shareResult } from "~/lib/result-actions";

export function ResultInspect({
  prompt,
  imageUrl,
  filename,
  shareUrl,
  base,
  looks,
  backHref,
  secondary,
}: {
  prompt: string;
  imageUrl: string;
  filename: string;
  shareUrl: string;
  base: GalleryImage | null;
  looks: GalleryImage[];
  backHref?: string;
  secondary: ReactNode;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const title = jobTitle(prompt);

  async function onDownload() {
    setBusy(true);
    setStatus(null);
    try {
      await downloadImage(imageUrl, filename);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Download failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onShare() {
    setBusy(true);
    setStatus(null);
    try {
      const outcome = await shareResult({
        pageUrl: shareUrl,
        imageUrl,
        filename,
        title,
      });
      if (outcome === "copied") {
        setStatus("Link copied.");
      } else if (outcome === "downloaded") {
        setStatus("Saved the image.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Share failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex h-dvh max-w-5xl flex-col overflow-hidden px-6 py-4">
      <header className="flex shrink-0 items-center justify-between gap-4">
        {backHref ? (
          <Link to={backHref} className="text-sm text-[var(--color-muted)]">
            Back
          </Link>
        ) : (
          <p className="text-sm tracking-wide">Casa</p>
        )}
        {backHref ? <p className="text-sm tracking-wide">Casa</p> : <span />}
      </header>

      <div className="mt-3 flex min-h-0 flex-1 items-center justify-center">
        <img
          src={imageUrl}
          alt={title}
          className="max-h-full max-w-full object-contain"
        />
      </div>

      <section className="mt-3 shrink-0 pb-2">
        {prompt.trim() ? (
          <p className="truncate text-sm text-[var(--color-muted)]">
            {prompt.trim()}
          </p>
        ) : null}

        <RecipeStrip base={base} looks={looks} />

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onDownload()}
            className={`${primaryActionClass} flex-1`}
          >
            Download
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onShare()}
            className={`${primaryActionClass} flex-1`}
          >
            Share
          </button>
        </div>

        {secondary}
        {status ? (
          <p className="mt-2 text-sm text-[var(--color-accent)]">{status}</p>
        ) : null}
      </section>
    </main>
  );
}

function RecipeStrip({
  base,
  looks,
}: {
  base: GalleryImage | null;
  looks: GalleryImage[];
}) {
  if (!base && looks.length === 0) {
    return null;
  }

  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {base ? (
        <li>
          <img
            src={base.url}
            alt="Base"
            className="h-14 w-16 rounded object-cover"
          />
          <p className="mt-1 text-center text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
            Base
          </p>
        </li>
      ) : null}
      {looks.map((item, index) => (
        <li key={item.id}>
          <img
            src={item.url}
            alt={item.filename}
            className="h-14 w-16 rounded object-cover"
          />
          <p className="mt-1 text-center text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
            Look {index + 1}
          </p>
        </li>
      ))}
    </ul>
  );
}
