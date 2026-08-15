import { useEffect, useState } from "react";
import { Form, useActionData, useNavigation } from "react-router";

import { signOut } from "~/lib/auth";
import type { ImageProvider } from "~/lib/generate/types";
import type { GalleryImage } from "~/lib/images.server";
import { loadPromptHistory, rememberPrompt } from "~/lib/prompt-history";

type WorkingRole = "base" | "reference" | "inspiration";

type WorkingSet = {
  base: GalleryImage | null;
  references: GalleryImage[];
  inspirations: GalleryImage[];
};

const emptySet: WorkingSet = {
  base: null,
  references: [],
  inspirations: [],
};

function withoutId(items: GalleryImage[], id: string) {
  return items.filter((item) => item.id !== id);
}

export function WorkingSetStudio({
  userName,
  userEmail,
  images,
}: {
  userName: string;
  userEmail: string;
  images: GalleryImage[];
}) {
  const navigation = useNavigation();
  const actionData = useActionData<{ error?: string }>();
  const uploading = navigation.state !== "idle";
  const [workingSet, setWorkingSet] = useState<WorkingSet>(emptySet);
  const [gallery, setGallery] = useState(images);
  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState<ImageProvider>("openai");
  const [structureLock, setStructureLock] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<GalleryImage | null>(null);
  const [promptHistory, setPromptHistory] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    setGallery(images);
  }, [images]);

  useEffect(() => {
    setPromptHistory(loadPromptHistory());
    try {
      if (window.localStorage.getItem("casa.structureLock") === "0") {
        setStructureLock(false);
      }
    } catch {
      // ignore
    }
  }, []);

  const canGenerate =
    Boolean(workingSet.base) ||
    workingSet.references.length > 0 ||
    workingSet.inspirations.length > 0;

  function assign(image: GalleryImage, role: WorkingRole) {
    setWorkingSet((current) => {
      if (role === "base") {
        return {
          base: image,
          references: withoutId(current.references, image.id),
          inspirations: withoutId(current.inspirations, image.id),
        };
      }
      if (role === "reference") {
        const already = current.references.some((item) => item.id === image.id);
        return {
          base: current.base?.id === image.id ? null : current.base,
          references: already
            ? current.references
            : [...current.references, image],
          inspirations: withoutId(current.inspirations, image.id),
        };
      }
      const already = current.inspirations.some((item) => item.id === image.id);
      return {
        base: current.base?.id === image.id ? null : current.base,
        references: withoutId(current.references, image.id),
        inspirations: already
          ? current.inspirations
          : [...current.inspirations, image],
      };
    });
  }

  function persistStructureLock(next: boolean) {
    setStructureLock(next);
    try {
      window.localStorage.setItem("casa.structureLock", next ? "1" : "0");
    } catch {
      // ignore
    }
  }

  async function onGenerate() {
    if (!canGenerate || generating) {
      return;
    }

    setGenerateError(null);
    setGenerating(true);
    setPromptHistory(rememberPrompt(prompt));

    try {
      const response = await fetch("/api/generate-scene", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          quality: "low",
          direction: prompt,
          structureLock,
          baseId: workingSet.base?.id ?? null,
          referenceIds: workingSet.references.map((item) => item.id),
          inspirationIds: workingSet.inspirations.map((item) => item.id),
        }),
      });
      const body = (await response.json()) as {
        image?: GalleryImage;
        error?: string;
      };
      if (!response.ok || !body.image) {
        throw new Error(body.error ?? "Generate failed.");
      }

      setLastResult(body.image);
      setGallery((current) => [
        body.image!,
        ...current.filter((item) => item.id !== body.image!.id),
      ]);
    } catch (error) {
      setGenerateError(
        error instanceof Error ? error.message : "Generate failed.",
      );
    } finally {
      setGenerating(false);
    }
  }

  function clearSlot(role: WorkingRole, id?: string) {
    setWorkingSet((current) => {
      if (role === "base") {
        return { ...current, base: null };
      }
      if (role === "reference") {
        return {
          ...current,
          references: id ? withoutId(current.references, id) : [],
        };
      }
      return {
        ...current,
        inspirations: id ? withoutId(current.inspirations, id) : [],
      };
    });
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--color-accent)]">Casa</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Working set
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Signed in as {userName} ({userEmail})
          </p>
        </div>
        <button
          type="button"
          className="text-sm text-[var(--color-muted)] underline"
          onClick={() => {
            void signOut().then(() => window.location.assign("/"));
          }}
        >
          Sign out
        </button>
      </header>

      <section className="mt-10 rounded-lg border border-[var(--color-muted)]/30 p-5">
        <h2 className="text-lg font-medium">Upload</h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Files go to R2. Only you can see them.
        </p>
        <Form
          method="post"
          encType="multipart/form-data"
          className="mt-4 flex flex-wrap items-center gap-3"
        >
          <input type="hidden" name="intent" value="upload" />
          <input
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            required
            className="text-sm"
          />
          <button
            type="submit"
            disabled={uploading}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 font-medium text-[var(--color-page)] disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload to gallery"}
          </button>
        </Form>
        {actionData?.error ? (
          <p className="mt-3 text-sm text-[var(--color-accent)]">
            {actionData.error}
          </p>
        ) : null}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-3">
        <Slot
          title="Base"
          hint="One image. The room you want to change."
          images={workingSet.base ? [workingSet.base] : []}
          onClear={(id) => clearSlot("base", id)}
        />
        <Slot
          title="References"
          hint="Objects or materials to keep."
          images={workingSet.references}
          onClear={(id) => clearSlot("reference", id)}
        />
        <Slot
          title="Inspirations"
          hint="Look and mood."
          images={workingSet.inspirations}
          onClear={(id) => clearSlot("inspiration", id)}
        />
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium">Gallery</h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Pick an image into a working-set slot. Generations land here too.
        </p>
        {gallery.length === 0 ? (
          <p className="mt-6 text-[var(--color-muted)]">
            No images yet. Upload one above.
          </p>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {gallery.map((item) => (
              <li
                key={item.id}
                className="overflow-hidden rounded-lg border border-[var(--color-muted)]/30"
              >
                <img
                  src={item.url}
                  alt={item.filename}
                  className="aspect-[4/3] w-full object-cover"
                />
                <div className="p-3">
                  <p className="truncate text-sm">{item.filename}</p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    {item.kind}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <RoleButton onClick={() => assign(item, "base")}>
                      Base
                    </RoleButton>
                    <RoleButton onClick={() => assign(item, "reference")}>
                      Ref
                    </RoleButton>
                    <RoleButton onClick={() => assign(item, "inspiration")}>
                      Insp
                    </RoleButton>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 rounded-lg border border-[var(--color-muted)]/30 p-5">
        <h2 className="text-lg font-medium">Prompt</h2>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Provider">
          {(["openai", "gemini"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={provider === option}
              onClick={() => setProvider(option)}
              className={`rounded border px-3 py-1 text-sm ${
                provider === option
                  ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                  : "border-[var(--color-muted)]/40"
              }`}
            >
              {option === "openai" ? "OpenAI" : "Gemini"}
            </button>
          ))}
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={structureLock}
            onChange={(event) => persistStructureLock(event.target.checked)}
            className="mt-1"
          />
          <span>
            Lock room structure
            <span className="block text-[var(--color-muted)]">
              Keeps camera, walls, and openings fixed. BASE wins geometry;
              REFERENCES win furniture and materials; INSPIRATIONS fill gaps.
            </span>
          </span>
        </label>
        <textarea
          rows={4}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Optional direction — e.g. cozy evening light, swap the sofa"
          className="mt-3 w-full resize-y rounded-md border border-[var(--color-muted)]/40 bg-transparent px-3 py-2 text-[var(--color-ink)] placeholder:text-[var(--color-muted)]"
        />
        {promptHistory.length > 0 ? (
          <div className="mt-3">
            <button
              type="button"
              className="text-sm text-[var(--color-muted)] underline"
              onClick={() => setHistoryOpen((open) => !open)}
            >
              Recent prompts ({promptHistory.length})
            </button>
            {historyOpen ? (
              <ul className="mt-2 space-y-1">
                {promptHistory.map((entry) => (
                  <li key={entry}>
                    <button
                      type="button"
                      className="truncate text-left text-sm text-[var(--color-accent)]"
                      onClick={() => setPrompt(entry)}
                    >
                      {entry.length > 72 ? `${entry.slice(0, 71)}…` : entry}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {generateError ? (
          <p className="mt-3 text-sm text-[var(--color-accent)]">{generateError}</p>
        ) : null}
        <button
          type="button"
          disabled={!canGenerate || generating}
          onClick={() => void onGenerate()}
          className="mt-5 rounded-md bg-[var(--color-accent)] px-4 py-2 font-medium text-[var(--color-page)] disabled:opacity-50"
        >
          {generating ? "Generating…" : "Generate"}
        </button>
        {!canGenerate ? (
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Pick a base, reference, or inspiration first.
          </p>
        ) : null}
        {lastResult ? (
          <div className="mt-6 flex items-center gap-4">
            <img
              src={lastResult.url}
              alt={lastResult.filename}
              className="h-24 w-24 rounded object-cover"
            />
            <div>
              <p className="text-sm">Latest generation</p>
              <button
                type="button"
                className="mt-2 text-sm text-[var(--color-accent)] underline"
                onClick={() => assign(lastResult, "base")}
              >
                Use as base
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function Slot({
  title,
  hint,
  images,
  onClear,
}: {
  title: string;
  hint: string;
  images: GalleryImage[];
  onClear: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-muted)]/30 p-4">
      <h2 className="font-medium">{title}</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">{hint}</p>
      {images.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--color-muted)]">Empty</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {images.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              <img
                src={item.url}
                alt={item.filename}
                className="h-14 w-14 rounded object-cover"
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {item.filename}
              </span>
              <button
                type="button"
                onClick={() => onClear(item.id)}
                className="text-xs text-[var(--color-muted)] underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RoleButton({
  children,
  onClick,
}: {
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-[var(--color-muted)]/40 px-2 py-1 text-xs"
    >
      {children}
    </button>
  );
}
