import { useState } from "react";
import { Link, redirect, useNavigate } from "react-router";

import type { Route } from "./+types/generate.looks";

import { CloseIcon, PlusIcon } from "~/components/icons";
import { ComposeChrome } from "~/components/compose-chrome";
import {
  FromLibraryButton,
  LibraryModal,
  UploadButton,
} from "~/components/library-picker";
import { headingClass } from "~/lib/brand";
import { LOOK_CAP, composePath, parseCompose, primaryActionClass } from "~/lib/compose";
import { getEnv } from "~/lib/env.server";
import {
  getOwnedImage,
  listUserImages,
  type GalleryImage,
} from "~/lib/images.server";
import { requirePageUser } from "~/lib/require-auth";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requirePageUser(request, context);
  const env = getEnv(context);
  const compose = parseCompose(new URL(request.url));
  if (!compose.baseId) {
    throw redirect(composePath("room", compose));
  }

  const base = await getOwnedImage(env, user.id, compose.baseId);
  if (!base) {
    throw redirect(composePath("room", { ...compose, baseId: null }));
  }

  const images = await listUserImages(env, user.id);
  const selectedLooks = compose.lookIds
    .map((id) => images.find((item) => item.id === id))
    .filter((item): item is GalleryImage => Boolean(item));
  const baseImage =
    images.find((item) => item.id === compose.baseId) ??
    ({
      id: base.id,
      filename: base.filename,
      kind: base.kind,
      createdAt: base.createdAt,
      url: `/api/images/${base.id}`,
    } satisfies GalleryImage);

  return {
    images,
    compose: { ...compose, lookIds: selectedLooks.map((item) => item.id) },
    selectedLooks,
    base: baseImage,
  };
}

export default function GenerateLooks({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const { images, compose, selectedLooks, base } = loaderData;
  const [libraryOpen, setLibraryOpen] = useState(false);

  function go(nextLooks: string[]) {
    navigate(
      composePath("looks", {
        ...compose,
        lookIds: nextLooks,
      }),
      { replace: true },
    );
  }

  function addLook(image: GalleryImage) {
    if (compose.lookIds.includes(image.id)) {
      go(compose.lookIds.filter((id) => id !== image.id));
      return;
    }
    if (compose.lookIds.length >= LOOK_CAP) {
      return;
    }
    go([...compose.lookIds, image.id]);
  }

  const mosaicHref = composePath("mosaic", compose);

  return (
    <ComposeChrome stepLabel="2 of 3 · Look">
      <h1 className={`mt-10 text-4xl ${headingClass}`}>
        Steal a look
      </h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Steal the sofa, the paint, the mood.
      </p>

      <div className="mt-6 flex items-center gap-3">
        <img
          src={base.url}
          alt={base.filename}
          className="h-14 w-14 rounded-md object-cover"
        />
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            The room
          </p>
          <p className="truncate text-sm">{base.filename}</p>
        </div>
      </div>

      <section className="mt-8">
        <p className="text-sm text-[var(--muted)]">
          Selected ({selectedLooks.length})
        </p>
        <ul className="mt-3 flex flex-wrap gap-3">
          {selectedLooks.map((item) => (
            <li
              key={item.id}
              className="relative h-28 w-36 overflow-hidden rounded-md border border-[var(--muted)]/30"
            >
              <img
                src={item.url}
                alt={item.filename}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                aria-label={`Remove ${item.filename}`}
                onClick={() =>
                  go(compose.lookIds.filter((id) => id !== item.id))
                }
                className="absolute right-1 top-1 rounded-full bg-[var(--plaster)]/80 p-1"
              >
                <CloseIcon />
              </button>
            </li>
          ))}
          {selectedLooks.length < LOOK_CAP ? (
            <li>
              <button
                type="button"
                onClick={() => setLibraryOpen(true)}
                aria-label="From library"
                className="flex h-28 w-36 items-center justify-center rounded-md border border-dashed border-[var(--muted)]/50 text-[var(--muted)]"
              >
                <PlusIcon />
              </button>
            </li>
          ) : null}
        </ul>
      </section>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <UploadButton label="Upload a look" onUploaded={addLook} />
        <FromLibraryButton onClick={() => setLibraryOpen(true)} />
      </div>
      <LibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        images={images}
        selectedIds={compose.lookIds}
        mode="multi"
        onSelect={addLook}
      />

      <div className="mt-10 flex items-center justify-end gap-4">
        <Link
          to={composePath("mosaic", { ...compose, lookIds: [] })}
          className="text-sm text-[var(--muted)] underline"
        >
          Skip
        </Link>
        <Link
          to={mosaicHref}
          className={primaryActionClass}
        >
          Continue
        </Link>
      </div>
      <p className="mt-2 text-right text-xs text-[var(--muted)]">
        Optional. Skip is valid.
      </p>
    </ComposeChrome>
  );
}
