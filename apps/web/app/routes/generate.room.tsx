import { useNavigate } from "react-router";

import type { Route } from "./+types/generate.room";

import { ComposeChrome } from "~/components/compose-chrome";
import { LibraryPicker } from "~/components/library-picker";
import { composePath, parseCompose } from "~/lib/compose";
import { getEnv } from "~/lib/env.server";
import {
  lastDoneJob,
  latestRunningJob,
  listUserGenerations,
} from "~/lib/generations.server";
import { listUserImages, type GalleryImage } from "~/lib/images.server";
import { formatAgo } from "~/lib/relative-time";
import { requirePageUser } from "~/lib/require-auth";

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
      <h1 className="mt-10 text-4xl font-semibold tracking-tight">
        What&apos;s the room?
      </h1>

      {running ? (
        <p className="mt-6 text-sm text-[var(--color-accent)]">
          Last job is still generating. Pick another room.
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

      <div className="mt-8">
        <LibraryPicker
          images={images}
          selectedIds={compose.baseId ? [compose.baseId] : []}
          mode="single"
          uploadLabel="Upload a photo"
          onUploaded={pickBase}
          onSelect={pickBase}
        />
      </div>
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
      <p className="mb-2 text-sm text-[var(--color-accent)]">
        Continue from last
      </p>
      <button
        type="button"
        onClick={() => onPick(image)}
        className="flex w-full items-center gap-4 rounded-md border border-[var(--color-accent)] p-3 text-left"
      >
        <img
          src={image.url}
          alt={image.filename}
          className="h-20 w-20 rounded object-cover"
        />
        <span>
          <span className="block text-sm">
            {prompt.trim() || image.filename}
          </span>
          <span className="mt-1 block text-xs text-[var(--color-muted)]">
            Generated {formatAgo(createdAt, now)}
          </span>
        </span>
      </button>
    </section>
  );
}
