import type { GalleryImage } from "~/lib/images.server";

export type PexelsPhoto = {
  id: number;
  photographer: string;
  photographerUrl: string;
  alt: string;
  src: string;
};

export type PexelsSearchPayload = {
  query: string;
  suggested: boolean;
  photos: PexelsPhoto[];
};

export const PEXELS_EMPTY_COPY = "Nothing useful. Try a color or a fabric.";

const MATERIAL =
  /\b(velvet|linen|oak|walnut|wool|boucle|brass|plaster|silk|cotton|leather|cane|rattan|marble|jute|mohair|tweed|ceramic|terracotta|limewash|wood|wooden|fabric|upholstery|suede|corduroy|shearling|travertine|concrete|teak|ash|pine|brushed|matte|weave|grain|cashmere|chenille|wicker|terrazzo|limestone|alabaster|nubuck|felt|hide|linen)\b/i;

const FURNITURE_OR_ROOM =
  /\b(sofas?|couches?|chairs?|armchairs?|loveseats?|sectionals?|ottomans?|living room|bedroom|kitchen|dining room|rooms?|interior|redesign|makeover)\b/gi;

export function normalizeLookQuery(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ");
  if (cleaned.length < 2 || cleaned.length > 80) {
    return null;
  }
  if (!/[a-zA-Z]/.test(cleaned)) {
    return null;
  }

  const lower = cleaned.toLowerCase();
  if (/\b(redesign|makeover|interior design)\b/.test(lower)) {
    return null;
  }

  if (MATERIAL.test(cleaned)) {
    return cleaned;
  }

  const withoutFurniture = cleaned
    .replace(FURNITURE_OR_ROOM, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (withoutFurniture.length >= 3) {
    return `${withoutFurniture} fabric`;
  }
  return null;
}

type SearchResponse = PexelsSearchPayload & { error?: string };
type ImportResponse = { image?: GalleryImage; error?: string };

export async function searchPexelsLooks(input: {
  query?: string;
  baseId?: string;
}): Promise<PexelsSearchPayload> {
  const params = new URLSearchParams();
  if (input.query) {
    params.set("query", input.query);
  }
  if (input.baseId) {
    params.set("baseId", input.baseId);
  }

  const response = await fetch(`/api/pexels/search?${params.toString()}`, {
    credentials: "include",
  });
  const payload = (await response.json()) as SearchResponse;
  if (response.status === 503) {
    throw new PexelsUnavailableError();
  }
  if (!response.ok) {
    throw new Error(payload.error ?? "Search failed.");
  }
  return payload;
}

export async function importPexelsLook(id: number): Promise<GalleryImage> {
  const response = await fetch("/api/pexels/import", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  const payload = (await response.json()) as ImportResponse;
  if (response.status === 503) {
    throw new PexelsUnavailableError();
  }
  if (!response.ok || !payload.image) {
    throw new Error(payload.error ?? "Could not add that photo.");
  }
  return payload.image;
}

export class PexelsUnavailableError extends Error {
  constructor() {
    super("Pexels is not configured.");
    this.name = "PexelsUnavailableError";
  }
}
