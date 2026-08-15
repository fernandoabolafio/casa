import { useState } from "react";
import { Link, redirect } from "react-router";

import type { Route } from "./+types/results.$jobId";

import { composePath, jobTitle, primaryActionClass } from "~/lib/compose";
import { getEnv } from "~/lib/env.server";
import { getUserGenerationJob } from "~/lib/generations.server";
import type { GalleryImage } from "~/lib/images.server";
import { requirePageUser } from "~/lib/require-auth";
import { downloadImage, shareResult } from "~/lib/result-actions";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = await requirePageUser(request, context);
  const job = await getUserGenerationJob(
    getEnv(context),
    user.id,
    params.jobId,
  );
  if (!job?.result) {
    throw redirect("/");
  }
  return { job };
}

export default function ResultView({ loaderData }: Route.ComponentProps) {
  const { job } = loaderData;
  const image = job.result;
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!image) {
    return null;
  }

  const imageUrl = image.url;
  const filename = image.filename || `casa-${job.id}.png`;
  const title = jobTitle(job.prompt);
  const promoteHref = composePath("looks", { baseId: image.id });

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
        pageUrl: window.location.href,
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
        <Link to="/" className="text-sm text-[var(--color-muted)]">
          Back
        </Link>
        <p className="text-sm tracking-wide">Casa</p>
      </header>

      <div className="mt-3 flex min-h-0 flex-1 items-center justify-center">
        <img
          src={imageUrl}
          alt={title}
          className="max-h-full max-w-full object-contain"
        />
      </div>

      <section className="mt-3 shrink-0 pb-2">
        {job.prompt.trim() ? (
          <p className="truncate text-sm text-[var(--color-muted)]">
            {job.prompt.trim()}
          </p>
        ) : null}

        <RecipeStrip base={job.base} looks={job.inspirations} />

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

        <p className="mt-3 flex flex-wrap gap-4 text-sm">
          <Link to={promoteHref} className="text-[var(--color-muted)] underline">
            Use as base
          </Link>
          <Link to="/generate/room" className="text-[var(--color-muted)] underline">
            New generation
          </Link>
        </p>
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
