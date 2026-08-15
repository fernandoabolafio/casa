import { useState } from "react";
import { Form, useActionData, useNavigation } from "react-router";

import { authClient } from "~/lib/auth-client";
import type { GalleryImage } from "~/lib/images.server";

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
  const [prompt, setPrompt] = useState("");

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
            void authClient.signOut({
              fetchOptions: { onSuccess: () => window.location.assign("/") },
            });
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
          Pick an image into a working-set slot. Later generations will land
          here too.
        </p>
        {images.length === 0 ? (
          <p className="mt-6 text-[var(--color-muted)]">
            No images yet. Upload one above.
          </p>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((item) => (
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
        <textarea
          rows={4}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Describe the room you want to generate"
          className="mt-3 w-full resize-y rounded-md border border-[var(--color-muted)]/40 bg-transparent px-3 py-2 text-[var(--color-ink)] placeholder:text-[var(--color-muted)]"
        />
        <p className="mt-3 text-sm text-[var(--color-muted)]">
          TODO: generate-scene, edit-scene, prompt history, voice prompt. The
          working implementations still live in <code>apps/canvas</code>.
        </p>
        <button
          type="button"
          disabled
          className="mt-5 rounded-md bg-[var(--color-accent)] px-4 py-2 font-medium text-[var(--color-page)] disabled:opacity-50"
        >
          Generate (not implemented)
        </button>
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
