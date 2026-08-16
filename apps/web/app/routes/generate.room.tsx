import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import type { Route } from "./+types/generate.room";

import { ComposeChrome } from "~/components/compose-chrome";
import {
  FromLibraryButton,
  LibraryModal,
  UploadButton,
} from "~/components/library-picker";
import { headingClass } from "~/lib/brand";
import { composePath, parseCompose, primaryActionClass } from "~/lib/compose";
import { getEnv } from "~/lib/env.server";
import {
  lastDoneJob,
  latestRunningJob,
  listUserGenerations,
} from "~/lib/generations.server";
import { listUserImages, type GalleryImage } from "~/lib/images.server";
import { formatAgo } from "~/lib/relative-time";
import { requirePageUser } from "~/lib/require-auth";

const phoneishQuery = "(hover: none) and (pointer: coarse)";

function usePhoneish(): boolean | null {
  const [phoneish, setPhoneish] = useState<boolean | null>(null);

  useEffect(() => {
    const media = window.matchMedia(phoneishQuery);
    const sync = () => setPhoneish(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return phoneish;
}

/** Clay ranking for the three room sources. Library is never clay. */
function roomSourceEmphasis(
  hasUploads: boolean,
  phoneish: boolean | null,
): { takePhoto: boolean; choosePhotos: boolean } {
  if (!hasUploads && phoneish === false) {
    return { takePhoto: false, choosePhotos: true };
  }
  return { takePhoto: true, choosePhotos: false };
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requirePageUser(request, context);
  const env = getEnv(context);
  const compose = parseCompose(new URL(request.url));
  const [images, jobs] = await Promise.all([
    listUserImages(env, user.id),
    listUserGenerations(env, user.id),
  ]);
  return {
    images,
    compose,
    lastDone: lastDoneJob(jobs),
    running: latestRunningJob(jobs),
    now: Date.now(),
  };
}

export default function GenerateRoom({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const { images, compose, lastDone, running, now } = loaderData;
  const [libraryOpen, setLibraryOpen] = useState(false);
  const hasUploads = images.some((item) => item.kind === "upload");
  const phoneish = usePhoneish();
  const emphasis = roomSourceEmphasis(hasUploads, phoneish);

  function pickBase(image: GalleryImage) {
    navigate(
      composePath("looks", {
        ...compose,
        baseId: image.id,
      }),
    );
  }

  return (
    <ComposeChrome stepLabel="1 of 3 · The room">
      <h1 className={`mt-10 text-4xl ${headingClass}`}>
        What&apos;s the room?
      </h1>

      {running ? (
        <p className="mt-6 text-sm text-[var(--lamp)]">
          Last job is still generating — about a minute. Pick another room.
        </p>
      ) : null}

      {lastDone?.result ? (
        <ContinueFromLast
          image={lastDone.result}
          prompt={lastDone.prompt}
          createdAt={lastDone.createdAt}
          now={now}
          onPick={pickBase}
        />
      ) : null}

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <UploadButton
          label="Take a photo"
          capture="environment"
          emphasize={emphasis.takePhoto}
          onUploaded={pickBase}
        />
        <UploadButton
          label="Choose from photos"
          emphasize={emphasis.choosePhotos}
          onUploaded={pickBase}
        />
        <FromLibraryButton onClick={() => setLibraryOpen(true)} />
      </div>
      <LibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        images={images}
        selectedIds={compose.baseId ? [compose.baseId] : []}
        mode="single"
        onSelect={pickBase}
      />
    </ComposeChrome>
  );
}

function ContinueFromLast({
  image,
  prompt,
  createdAt,
  now,
  onPick,
}: {
  image: GalleryImage;
  prompt: string;
  createdAt: number;
  now: number;
  onPick: (image: GalleryImage) => void;
}) {
  return (
    <section className="mt-8">
      <p className="mb-2 text-sm text-[var(--lamp)]">
        Continue from last
      </p>
      <button
        type="button"
        onClick={() => onPick(image)}
        className="flex w-full items-center gap-4 rounded-md border border-[var(--lamp)] p-3 text-left"
      >
        <img
          src={image.url}
          alt={image.filename}
          className="h-24 w-24 rounded object-cover"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm">
            {prompt.trim() || image.filename}
          </span>
          <span className="mt-1 block text-xs text-[var(--muted)]">
            Generated {formatAgo(createdAt, now)}
          </span>
          <span className={`${primaryActionClass} mt-3`}>Continue from last</span>
        </span>
      </button>
    </section>
  );
}
