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
import { LOOK_CAP, composePath, parseCompose, primaryActionClass } from "~/lib/compose";
import { getEnv } from "~/lib/env.server";
import { enqueueGeneration } from "~/lib/generate/start";
import { providerSchema } from "~/lib/generate/scene";
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

  let provider: string;
  try {
    provider = providerSchema.parse(String(form.get("provider") ?? "openai"));
  } catch {
    return { error: "Pick OpenAI or Gemini." };
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
  const { compose, base, looks, images } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";
  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState<"openai" | "gemini">("openai");
  const [structureLock, setStructureLock] = useState(compose.structureLock);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const roomHref = composePath("room", { ...compose, structureLock });

  function setLooks(lookIds: string[]) {
    navigate(
      composePath("mosaic", { ...compose, structureLock, lookIds }),
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
    <ComposeChrome>
      <div className="pb-36">
        <Link to={roomHref} className="mt-8 block">
          <div className="relative overflow-hidden rounded-lg border border-[var(--color-muted)]/30">
            <img
              src={base.url}
              alt={base.filename}
              className="aspect-[16/10] w-full object-cover"
            />
            <p className="absolute inset-0 flex items-center justify-center text-sm tracking-wide text-white/90">
              BASE · the room
            </p>
          </div>
        </Link>
        <label className="mt-3 flex items-center justify-center gap-2 text-xs text-[var(--color-muted)]">
          <input
            type="checkbox"
            checked={structureLock}
            onChange={(event) => setStructureLock(event.target.checked)}
            className="sr-only"
          />
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 ${
              structureLock
                ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                : "border-[var(--color-muted)]/40"
            }`}
          >
            <LockIcon />
            Keep walls & camera
          </span>
        </label>

        <section className="mt-8">
          <p className="text-sm text-[var(--color-muted)]">Looks</p>
          <ul className="mt-3 flex flex-wrap gap-3">
            {looks.map((item) => (
              <li
                key={item.id}
                className="relative h-24 w-28 overflow-hidden rounded-md border border-[var(--color-muted)]/30"
              >
                <img
                  src={item.url}
                  alt={item.filename}
                  className="h-full w-full object-cover"
                />
                <Link
                  to={composePath("mosaic", {
                    ...compose,
                    structureLock,
                    lookIds: compose.lookIds.filter((id) => id !== item.id),
                  })}
                  aria-label={`Remove ${item.filename}`}
                  className="absolute right-1 top-1 rounded-full bg-[var(--color-page)]/80 p-1"
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
                  className="flex h-24 w-28 items-center justify-center rounded-md border border-dashed border-[var(--color-muted)]/50 text-[var(--color-muted)]"
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
        className="fixed inset-x-0 bottom-0 border-t border-[var(--color-muted)]/20 bg-[var(--color-page)] px-6 py-3"
      >
        <input type="hidden" name="baseId" value={base.id} />
        <input type="hidden" name="lookIds" value={compose.lookIds.join(",")} />
        <input
          type="hidden"
          name="structureLock"
          value={structureLock ? "1" : "0"}
        />
        <input type="hidden" name="provider" value={provider} />
        <div className="mx-auto flex max-w-5xl items-end gap-3">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Optional direction</span>
            <span className="pointer-events-none absolute left-3 top-2.5 text-[var(--color-muted)]">
              <SparkleIcon />
            </span>
            <textarea
              name="prompt"
              rows={prompt.trim() ? 3 : 1}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Optional direction — swap the sofa, warmer wood"
              className="w-full resize-none rounded-md border border-[var(--color-muted)]/30 bg-transparent py-2 pl-9 pr-3 text-sm placeholder:text-[var(--color-muted)]"
            />
          </label>
          <div className="flex items-center gap-2">
            <label className="text-sm text-[var(--color-muted)]">
              <span className="sr-only">Model</span>
              <select
                value={provider}
                onChange={(event) =>
                  setProvider(event.target.value === "gemini" ? "gemini" : "openai")
                }
                className="rounded-md border border-[var(--color-muted)]/40 bg-[var(--color-page)] px-2 py-2 text-sm"
              >
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={!base.id || submitting}
              className={primaryActionClass}
            >
              {submitting ? "Starting…" : "Generate"}
            </button>
          </div>
        </div>
        {actionData?.error ? (
          <p className="mx-auto mt-2 max-w-5xl text-sm text-[var(--color-accent)]">
            {actionData.error}
          </p>
        ) : null}
      </Form>
    </ComposeChrome>
  );
}
