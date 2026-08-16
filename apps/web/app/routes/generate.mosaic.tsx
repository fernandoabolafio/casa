import { useState } from "react";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useNavigate,
  useNavigation,
} from "react-router";

import type { Route } from "./+types/generate.mosaic";

import { ComposeChrome } from "~/components/compose-chrome";
import { CloseIcon, LockIcon, PlusIcon, SparkleIcon } from "~/components/icons";
import { LibraryModal } from "~/components/library-picker";
import {
  LOOK_CAP,
  composePath,
  parseCompose,
  primaryActionClass,
  type ComposeState,
} from "~/lib/compose";
import { getEnv } from "~/lib/env.server";
import { enqueueGeneration } from "~/lib/generate/start";
import { providerSchema, type ImageProvider } from "~/lib/generate/scene";
import {
  getOwnedImage,
  listUserImages,
  type GalleryImage,
} from "~/lib/images.server";
import { requirePageUser } from "~/lib/require-auth";

/** Gemini held room geometry in live walks. Occupant path does not pick a vendor. */
const DEFAULT_PROVIDER: ImageProvider = "gemini";

function providerFromSearch(url: URL): ImageProvider {
  const parsed = providerSchema.safeParse(url.searchParams.get("provider"));
  return parsed.success ? parsed.data : DEFAULT_PROVIDER;
}

/** Quiet hatch: `?provider=openai` on the mosaic URL. Default Gemini is omitted. */
function mosaicPath(
  state: Partial<ComposeState>,
  provider: ImageProvider,
): string {
  const path = composePath("mosaic", state);
  if (provider === DEFAULT_PROVIDER) {
    return path;
  }
  return `${path}${path.includes("?") ? "&" : "?"}provider=${provider}`;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requirePageUser(request, context);
  const env = getEnv(context);
  const url = new URL(request.url);
  const compose = parseCompose(url);
  const provider = providerFromSearch(url);
  if (!compose.baseId) {
    throw redirect(composePath("room", compose));
  }

  const baseRow = await getOwnedImage(env, user.id, compose.baseId);
  if (!baseRow) {
    throw redirect(composePath("room", { ...compose, baseId: null }));
  }

  const images = await listUserImages(env, user.id);
  const base =
    images.find((item) => item.id === compose.baseId) ??
    ({
      id: baseRow.id,
      filename: baseRow.filename,
      kind: baseRow.kind,
      createdAt: baseRow.createdAt,
      url: `/api/images/${baseRow.id}`,
    } satisfies GalleryImage);

  const looks = compose.lookIds
    .map((id) => images.find((item) => item.id === id))
    .filter((item): item is GalleryImage => Boolean(item));

  return {
    compose: {
      ...compose,
      lookIds: looks.map((item) => item.id),
    },
    base,
    looks,
    images,
    provider,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requirePageUser(request, context);
  const env = getEnv(context);
  const form = await request.formData();
  const baseId = String(form.get("baseId") ?? "");
  const looksRaw = String(form.get("lookIds") ?? "");
  const prompt = String(form.get("prompt") ?? "");
  const lock = String(form.get("structureLock") ?? "1") !== "0";

  let provider: ImageProvider;
  try {
    provider = providerSchema.parse(
      String(form.get("provider") ?? DEFAULT_PROVIDER),
    );
  } catch {
    return { error: "Could not start generation." };
  }

  if (!baseId) {
    return { error: "Pick a room first." };
  }

  try {
    await enqueueGeneration({
      env,
      userId: user.id,
      baseImageId: baseId,
      inspirationIds: looksRaw ? looksRaw.split(",").filter(Boolean) : [],
      prompt,
      provider,
      structureLock: lock,
    });
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not start generation.",
    };
  }

  throw redirect("/");
}

export default function GenerateMosaic({ loaderData }: Route.ComponentProps) {
  const { compose, base, looks, images, provider } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";
  const [prompt, setPrompt] = useState("");
  const [structureLock, setStructureLock] = useState(compose.structureLock);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const roomHref = composePath("room", { ...compose, structureLock });

  function setLooks(lookIds: string[]) {
    navigate(
      mosaicPath({ ...compose, structureLock, lookIds }, provider),
      { replace: true },
    );
  }

  function addLook(image: GalleryImage) {
    if (compose.lookIds.includes(image.id)) {
      setLooks(compose.lookIds.filter((id) => id !== image.id));
      return;
    }
    if (compose.lookIds.length >= LOOK_CAP) {
      return;
    }
    setLooks([...compose.lookIds, image.id]);
  }

  return (
    <ComposeChrome flush>
      <div className="flex min-h-0 flex-1 flex-col pb-[9rem] md:pb-[6.25rem]">
        <Link
          to={roomHref}
          className="relative mt-3 min-h-0 flex-1 overflow-hidden rounded-lg border border-[var(--muted)]/30"
        >
          <img
            src={base.url}
            alt={base.filename}
            className="h-full w-full object-cover"
          />
          <p className="absolute inset-x-0 bottom-2 text-center text-xs tracking-wide text-white/90">
            BASE · the room
          </p>
        </Link>
        <label className="mt-2 flex shrink-0 items-center justify-center gap-2 text-xs text-[var(--muted)]">
          <input
            type="checkbox"
            checked={structureLock}
            onChange={(event) => setStructureLock(event.target.checked)}
            className="sr-only"
          />
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 ${
              structureLock
                ? "border-[var(--sage)] text-[var(--sage)]"
                : "border-[var(--muted)]/40"
            }`}
          >
            <LockIcon />
            Keep walls & camera
          </span>
        </label>

        <section className="mt-2 shrink-0">
          <p className="text-xs text-[var(--muted)]">Looks</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {looks.map((item) => (
              <li
                key={item.id}
                className="relative h-16 w-20 overflow-hidden rounded-md border border-[var(--muted)]/30"
              >
                <img
                  src={item.url}
                  alt={item.filename}
                  className="h-full w-full object-cover"
                />
                <Link
                  to={mosaicPath(
                    {
                      ...compose,
                      structureLock,
                      lookIds: compose.lookIds.filter((id) => id !== item.id),
                    },
                    provider,
                  )}
                  aria-label={`Remove ${item.filename}`}
                  className="absolute right-1 top-1 rounded-full bg-[var(--plaster)]/80 p-1"
                >
                  <CloseIcon />
                </Link>
              </li>
            ))}
            {looks.length < LOOK_CAP ? (
              <li>
                <button
                  type="button"
                  onClick={() => setLibraryOpen(true)}
                  aria-label="From library"
                  className="flex h-16 w-20 items-center justify-center rounded-md border border-dashed border-[var(--muted)]/50 text-[var(--muted)]"
                >
                  <PlusIcon />
                </button>
              </li>
            ) : null}
          </ul>
        </section>
      </div>
      <LibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        images={images}
        selectedIds={compose.lookIds}
        mode="multi"
        onSelect={addLook}
      />

      <Form
        method="post"
        className="fixed inset-x-0 bottom-0 border-t border-[var(--muted)]/20 bg-[var(--plaster)] px-6 py-3"
      >
        <input type="hidden" name="baseId" value={base.id} />
        <input type="hidden" name="lookIds" value={compose.lookIds.join(",")} />
        <input
          type="hidden"
          name="structureLock"
          value={structureLock ? "1" : "0"}
        />
        <input type="hidden" name="provider" value={provider} />
        <div className="mx-auto flex max-w-5xl flex-col gap-2 md:flex-row md:items-center">
          <label className="relative w-full min-w-0 md:flex-1">
            <span className="sr-only">Optional direction</span>
            <span className="pointer-events-none absolute left-3 top-2.5 text-[var(--muted)]">
              <SparkleIcon />
            </span>
            <textarea
              name="prompt"
              rows={1}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Optional direction — swap the sofa, warmer wood"
              className="w-full resize-none overflow-hidden rounded-md border border-[var(--muted)]/30 bg-transparent py-2 pl-9 pr-3 text-sm placeholder:text-[var(--muted)]"
            />
          </label>
          <button
            type="submit"
            disabled={!base.id || submitting}
            className={`${primaryActionClass} shrink-0`}
          >
            {submitting ? "Starting…" : "Generate"}
          </button>
        </div>
        {actionData?.error ? (
          <p className="mx-auto mt-2 max-w-5xl text-sm text-[var(--clay)]">
            {actionData.error}
          </p>
        ) : (
          <p className="mx-auto mt-2 max-w-5xl text-xs text-[var(--muted)]">
            One image. About a minute. You can leave and come back.
          </p>
        )}
      </Form>
    </ComposeChrome>
  );
}
