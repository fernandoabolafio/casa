import { useRef, useState } from "react";

import { GridIcon, UploadIcon } from "~/components/icons";
import { primaryActionClass, secondaryActionClass } from "~/lib/compose";
import type { GalleryImage } from "~/lib/images.server";
import { uploadImage } from "~/lib/upload-image";

type Pile = "upload" | "generation";

export function LibraryPicker({
  images,
  selectedIds,
  mode,
  uploadLabel,
  onUploaded,
  onSelect,
  showActions = true,
  emphasizeUpload = false,
}: {
  images: GalleryImage[];
  selectedIds: string[];
  mode: "single" | "multi";
  uploadLabel: string;
  onUploaded: (image: GalleryImage) => void;
  onSelect: (image: GalleryImage) => void;
  showActions?: boolean;
  emphasizeUpload?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLDivElement>(null);
  const [pile, setPile] = useState<Pile>("upload");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploads = images.filter((item) => item.kind === "upload");
  const generations = images.filter((item) => item.kind === "generation");
  const shown = pile === "upload" ? uploads : generations;

  async function onFile(file: File | undefined) {
    if (!file || uploading) {
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const image = await uploadImage(file);
      onUploaded(image);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={(event) => {
          void onFile(event.target.files?.[0]);
        }}
      />

      {showActions ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className={`flex items-center justify-center gap-2 px-4 py-3 ${
              emphasizeUpload ? primaryActionClass : secondaryActionClass
            }`}
          >
            <UploadIcon />
            {uploading ? "Uploading…" : uploadLabel}
          </button>
          <button
            type="button"
            onClick={() =>
              libraryRef.current?.scrollIntoView({ behavior: "smooth" })
            }
            className={`flex items-center justify-center gap-2 px-4 py-3 ${secondaryActionClass}`}
          >
            <GridIcon />
            From library
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 rounded-md border border-[var(--color-ink)]/70 px-4 py-2 text-sm disabled:opacity-50"
        >
          <UploadIcon />
          {uploading ? "Uploading…" : uploadLabel}
        </button>
      )}

      {error ? (
        <p className="mt-3 text-sm text-[var(--color-accent)]">{error}</p>
      ) : null}

      <div
        ref={libraryRef}
        id="library"
        className="mt-6 rounded-lg border border-[var(--color-muted)]/30 p-4"
      >
        <div className="flex gap-2">
          <PileTab
            active={pile === "upload"}
            onClick={() => setPile("upload")}
            label="Uploads"
          />
          <PileTab
            active={pile === "generation"}
            onClick={() => setPile("generation")}
            label="Generations"
          />
        </div>

        {shown.length === 0 ? (
          <p className="mt-6 text-sm text-[var(--color-muted)]">
            {pile === "upload"
              ? "No uploads yet."
              : "No generations yet."}
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {shown.map((item) => {
              const selected = selectedIds.includes(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    className={`block w-full overflow-hidden rounded-md border ${
                      selected
                        ? "border-[var(--color-accent)]"
                        : "border-[var(--color-muted)]/30"
                    }`}
                  >
                    <img
                      src={item.url}
                      alt={item.filename}
                      className="aspect-[4/3] w-full object-cover"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {mode === "single" ? (
          <p className="mt-4 text-xs text-[var(--color-muted)]">
            Most bases come from here.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PileTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-sm ${
        active
          ? "border border-[var(--color-ink)]"
          : "border border-[var(--color-muted)]/30 text-[var(--color-muted)]"
      }`}
    >
      {label}
    </button>
  );
}
