import { useEffect, useId, useRef, useState } from "react";

import { CloseIcon } from "~/components/icons";
import { LOOK_CAP } from "~/lib/compose";
import type { GalleryImage } from "~/lib/images.server";
import {
  importPexelsLook,
  normalizeLookQuery,
  PEXELS_EMPTY_COPY,
  PexelsUnavailableError,
  searchPexelsLooks,
  type PexelsPhoto,
} from "~/lib/pexels";

const SEARCH_WAIT_MS = 400;

export function PexelsLookStrip({
  baseId,
  lookIds,
  onPick,
}: {
  baseId: string;
  lookIds: string[];
  onPick: (image: GalleryImage) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const importedRef = useRef(new Map<number, GalleryImage>());
  const typedRef = useRef(false);

  const [hidden, setHidden] = useState(false);
  const [query, setQuery] = useState("");
  const [photos, setPhotos] = useState<PexelsPhoto[]>([]);
  const [searching, setSearching] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [importingId, setImportingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const requestId = ++requestRef.current;
    setSearching(true);
    void searchPexelsLooks({ baseId })
      .then((payload) => {
        if (requestId !== requestRef.current || typedRef.current) {
          return;
        }
        setQuery(payload.query);
        setPhotos(payload.photos);
        setEmpty(payload.query.length > 0 && payload.photos.length === 0);
      })
      .catch((caught: unknown) => {
        if (caught instanceof PexelsUnavailableError) {
          setHidden(true);
        }
      })
      .finally(() => {
        if (requestId === requestRef.current) {
          setSearching(false);
        }
      });
  }, [baseId]);

  useEffect(() => {
    if (!typedRef.current) {
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      requestRef.current += 1;
      setPhotos([]);
      setEmpty(false);
      setSearching(false);
      return;
    }

    if (!normalizeLookQuery(trimmed)) {
      requestRef.current += 1;
      setPhotos([]);
      setEmpty(true);
      setSearching(false);
      return;
    }

    const requestId = ++requestRef.current;
    const timer = window.setTimeout(() => {
      setSearching(true);
      setEmpty(false);
      void searchPexelsLooks({ query: trimmed })
        .then((payload) => {
          if (requestId !== requestRef.current) {
            return;
          }
          setPhotos(payload.photos);
          setEmpty(payload.photos.length === 0);
        })
        .catch((caught: unknown) => {
          if (caught instanceof PexelsUnavailableError) {
            setHidden(true);
            return;
          }
          if (requestId === requestRef.current) {
            setPhotos([]);
            setEmpty(true);
          }
        })
        .finally(() => {
          if (requestId === requestRef.current) {
            setSearching(false);
          }
        });
    }, SEARCH_WAIT_MS);

    return () => window.clearTimeout(timer);
  }, [query]);

  if (hidden) {
    return null;
  }

  function onQueryChange(value: string) {
    typedRef.current = true;
    setQuery(value);
    setError(null);
  }

  function clearQuery() {
    typedRef.current = true;
    setQuery("");
    setPhotos([]);
    setEmpty(false);
    setError(null);
    inputRef.current?.focus();
  }

  async function pick(photo: PexelsPhoto) {
    const existing = importedRef.current.get(photo.id);
    if (existing) {
      onPick(existing);
      return;
    }
    if (lookIds.length >= LOOK_CAP) {
      return;
    }
    if (importingId !== null) {
      return;
    }

    setError(null);
    setImportingId(photo.id);
    try {
      const image = await importPexelsLook(photo.id);
      importedRef.current.set(photo.id, image);
      onPick(image);
    } catch (caught) {
      if (caught instanceof PexelsUnavailableError) {
        setHidden(true);
        return;
      }
      setError(caught instanceof Error ? caught.message : "Could not add that photo.");
    } finally {
      setImportingId(null);
    }
  }

  const selectedIds = new Set(
    [...importedRef.current.entries()]
      .filter(([, image]) => lookIds.includes(image.id))
      .map(([id]) => id),
  );

  return (
    <div className="mt-8">
      <div className="mb-6 flex items-center gap-3 sm:hidden">
        <span className="h-px flex-1 bg-[var(--muted)]/30" />
        <span className="text-xs text-[var(--muted)]">or</span>
        <span className="h-px flex-1 bg-[var(--muted)]/30" />
      </div>

      <div className="sm:rounded-lg sm:bg-[var(--ink)]/[0.04] sm:px-5 sm:py-5">
        <p className="text-sm text-[var(--muted)]">Or from a photo</p>

        <div className="relative mt-3">
          <label htmlFor={inputId} className="sr-only">
            Search photos
          </label>
          <input
            id={inputId}
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="a color or a fabric"
            autoComplete="off"
            spellCheck={false}
            inputMode="search"
            className="w-full rounded-md border border-[var(--muted)]/40 bg-transparent py-2 pl-3 pr-24 text-sm text-[var(--ink)] placeholder:text-[var(--muted)]"
          />
          <div className="absolute inset-y-0 right-2 flex items-center gap-2">
            <button
              type="button"
              className="hidden text-xs text-[var(--muted)] sm:inline"
              onClick={() => inputRef.current?.focus()}
            >
              Edit
            </button>
            <span className="hidden h-3 w-px bg-[var(--muted)]/40 sm:block" />
            {query.length > 0 ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={clearQuery}
                className="rounded-full p-1 text-[var(--muted)]"
              >
                <CloseIcon />
              </button>
            ) : null}
          </div>
        </div>

        {photos.length > 0 ? (
          <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {photos.slice(0, 6).map((photo) => {
              const selected = selectedIds.has(photo.id);
              const busy = importingId === photo.id;
              return (
                <li key={photo.id} className="shrink-0">
                  <button
                    type="button"
                    disabled={importingId !== null && !busy}
                    onClick={() => {
                      void pick(photo);
                    }}
                    className={`block overflow-hidden rounded-md border-2 ${
                      selected
                        ? "border-[var(--clay)]"
                        : "border-[var(--muted)]/30"
                    } ${busy ? "opacity-60" : ""}`}
                  >
                    <img
                      src={photo.src}
                      alt={photo.alt || `Photo by ${photo.photographer}`}
                      title={`Photo by ${photo.photographer} on Pexels`}
                      className="h-20 w-20 object-cover sm:h-24 sm:w-24"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : searching ? (
          <ul className="mt-3 flex gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <li
                key={index}
                className="h-20 w-20 shrink-0 rounded-md bg-[var(--muted)]/15 sm:h-24 sm:w-24"
              />
            ))}
          </ul>
        ) : empty ? (
          <p className="mt-3 text-sm text-[var(--muted)]">{PEXELS_EMPTY_COPY}</p>
        ) : null}

        {error ? (
          <p className="mt-2 text-sm text-[var(--clay)]">{error}</p>
        ) : null}

        <p className="mt-2 text-xs text-[var(--muted)] sm:hidden">
          Tone only. Not the sofa.
        </p>
        <p className="mt-2 hidden text-xs text-[var(--muted)] sm:block">
          Color and fabric. The room stays yours.
        </p>
        <p className="mt-1 text-[10px] text-[var(--muted)]/80">
          Photos provided by{" "}
          <a
            href="https://www.pexels.com"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Pexels
          </a>
        </p>
      </div>
    </div>
  );
}
