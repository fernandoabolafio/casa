import { useState, type ReactNode } from "react";
import { Link } from "react-router";

import { Wordmark } from "~/components/wordmark";
import {
  jobTitle,
  primaryActionClass,
  secondaryActionClass,
} from "~/lib/compose";
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
  promoteHref,
  promoteLabel = "Use as base",
  showShare = true,
  secondary,
}: {
  prompt: string;
  imageUrl: string;
  filename: string;
  shareUrl: string;
  base: GalleryImage | null;
  looks: GalleryImage[];
  backHref?: string;
  promoteHref?: string;
  promoteLabel?: string;
  showShare?: boolean;
  secondary?: ReactNode;
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
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="flex shrink-0 items-center justify-between gap-4">
        {backHref ? (
          <Link to={backHref} className="text-sm text-[var(--muted)]">
            Back
          </Link>
        ) : (
          <Wordmark />
        )}
        {backHref ? <Wordmark /> : <span />}
      </header>

      <div className="mt-3">
        {base ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Shot
              src={base.url}
              label="Base"
              alt="The room photo this job started from"
            />
            <Shot src={imageUrl} label="Winner" alt={title} />
          </div>
        ) : (
          <Shot src={imageUrl} label="Winner" alt={title} />
        )}
      </div>

      <section className="mt-3 shrink-0">
        {prompt.trim() ? (
          <p className="truncate text-sm text-[var(--muted)]">
            {prompt.trim()}
          </p>
        ) : null}

        <LooksStrip looks={looks} />

        {promoteHref ? (
          <Link to={promoteHref} className={`${primaryActionClass} mt-3 w-full`}>
            {promoteLabel}
          </Link>
        ) : null}

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onDownload()}
            className={`${secondaryActionClass} flex-1 disabled:opacity-50`}
          >
            Download
          </button>
          {showShare ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onShare()}
              className={`${secondaryActionClass} flex-1 disabled:opacity-50`}
            >
              Share
            </button>
          ) : null}
        </div>

        {secondary}
        {status ? (
          <p
            className={`mt-2 text-sm ${
              status === "Link copied." || status === "Saved the image."
                ? "text-[var(--sage)]"
                : "text-[var(--clay)]"
            }`}
          >
            {status}
          </p>
        ) : null}
      </section>
    </main>
  );
}

function Shot({
  src,
  label,
  alt,
}: {
  src: string;
  label: string;
  alt: string;
}) {
  return (
    <div>
      <img
        src={src}
        alt={alt}
        className="aspect-[4/3] w-full rounded-lg object-cover"
      />
      <p className="mt-2 text-center text-[10px] uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
    </div>
  );
}

function LooksStrip({ looks }: { looks: GalleryImage[] }) {
  if (looks.length === 0) {
    return null;
  }

  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {looks.map((item, index) => (
        <li key={item.id}>
          <img
            src={item.url}
            alt={item.filename}
            className="h-14 w-16 rounded object-cover"
          />
          <p className="mt-1 text-center text-[10px] uppercase tracking-wide text-[var(--muted)]">
            Look {index + 1}
          </p>
        </li>
      ))}
    </ul>
  );
}
