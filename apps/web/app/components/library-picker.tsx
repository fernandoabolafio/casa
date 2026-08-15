import { useEffect, useId, useRef, useState } from "react";

import { CloseIcon, GridIcon, UploadIcon } from "~/components/icons";
import { primaryActionClass, secondaryActionClass } from "~/lib/compose";
import type { GalleryImage } from "~/lib/images.server";
import { uploadImage } from "~/lib/upload-image";

type Pile = "upload" | "generation";

export function UploadButton({
  label,
  emphasize = false,
  onUploaded,
}: {
  label: string;
  emphasize?: boolean;
  onUploaded: (image: GalleryImage) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className={`flex w-full items-center justify-center gap-2 px-4 py-3 ${
          emphasize ? primaryActionClass : secondaryActionClass
        }`}
      >
        <UploadIcon />
        {uploading ? "Uploading…" : label}
      </button>
      {error ? (
        <p className="mt-2 text-sm text-[var(--color-accent)]">{error}</p>
      ) : null}
    </div>
  );
}

export function FromLibraryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-center gap-2 px-4 py-3 ${secondaryActionClass}`}
    >
      <GridIcon />
      From library
    </button>
  );
}

export function LibraryModal({
  open,
  onClose,
  images,
  selectedIds,
  mode,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  images: GalleryImage[];
  selectedIds: string[];
  mode: "single" | "multi";
  onSelect: (image: GalleryImage) => void;
}) {
  const titleId = useId();
  const [pile, setPile] = useState<Pile>("upload");
  const uploads = images.filter((item) => item.kind === "upload");
  const generations = images.filter((item) => item.kind === "generation");
  const shown = pile === "upload" ? uploads : generations;

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setPile("upload");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  function pick(image: GalleryImage) {
    onSelect(image);
    if (mode === "single") {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-lg border border-[var(--color-muted)]/30 bg-[var(--color-page)] p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-lg font-medium">
            From library
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close library"
            className="rounded-full border border-[var(--color-muted)]/40 p-1.5"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mt-4 flex gap-2">
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

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {shown.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">
              {pile === "upload" ? "No uploads yet." : "No generations yet."}
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-3">
              {shown.map((item) => {
                const selected = selectedIds.includes(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => pick(item)}
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
        </div>

        {mode === "multi" ? (
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={onClose} className={primaryActionClass}>
              Done
            </button>
          </div>
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
