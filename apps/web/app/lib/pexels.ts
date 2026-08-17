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

const MATERIALS = new Set([
  "alabaster",
  "ash",
  "bamboo",
  "birch",
  "boucle",
  "brass",
  "brushed",
  "cane",
  "canvas",
  "cashmere",
  "cedar",
  "ceramic",
  "chenille",
  "concrete",
  "corduroy",
  "cotton",
  "fabric",
  "felt",
  "flannel",
  "grain",
  "hemp",
  "hide",
  "honed",
  "jute",
  "lacquer",
  "leather",
  "limewash",
  "limewashed",
  "limestone",
  "linen",
  "mahogany",
  "maple",
  "marble",
  "matte",
  "mohair",
  "nubuck",
  "oak",
  "oiled",
  "pine",
  "plaster",
  "rattan",
  "ribbed",
  "rosewood",
  "satin",
  "seersucker",
  "shearling",
  "silk",
  "sisal",
  "slub",
  "suede",
  "teak",
  "terracotta",
  "terrazzo",
  "travertine",
  "tweed",
  "twill",
  "upholstery",
  "velvet",
  "walnut",
  "weave",
  "wicker",
  "wood",
  "wooden",
  "wool",
]);

const COLORS = new Set([
  "amber",
  "aqua",
  "beige",
  "berry",
  "black",
  "blue",
  "blush",
  "bone",
  "brick",
  "bronze",
  "brown",
  "burgundy",
  "butter",
  "camel",
  "caramel",
  "charcoal",
  "chartreuse",
  "cherry",
  "chocolate",
  "cinnamon",
  "claret",
  "clay",
  "cobalt",
  "cognac",
  "copper",
  "coral",
  "cream",
  "denim",
  "ecru",
  "emerald",
  "espresso",
  "fern",
  "forest",
  "gold",
  "gray",
  "green",
  "greige",
  "grey",
  "honey",
  "indigo",
  "ivory",
  "jade",
  "khaki",
  "lavender",
  "lemon",
  "lilac",
  "magenta",
  "maroon",
  "mauve",
  "mint",
  "moss",
  "mustard",
  "navy",
  "oatmeal",
  "off-white",
  "offwhite",
  "ochre",
  "ocher",
  "olive",
  "orange",
  "paprika",
  "parchment",
  "peach",
  "periwinkle",
  "pink",
  "plum",
  "powder",
  "purple",
  "putty",
  "red",
  "rose",
  "rust",
  "saffron",
  "sage",
  "sand",
  "seafoam",
  "sienna",
  "silver",
  "sky",
  "slate",
  "stone",
  "tan",
  "taupe",
  "teal",
  "turquoise",
  "umber",
  "violet",
  "white",
  "wine",
  "yellow",
]);

const MODIFIERS = new Set([
  "aged",
  "bright",
  "burnt",
  "cool",
  "dark",
  "deep",
  "dusty",
  "light",
  "muted",
  "natural",
  "pale",
  "raw",
  "rich",
  "soft",
  "warm",
  "weathered",
]);

const FURNITURE = new Set([
  "armchair",
  "armchairs",
  "bench",
  "chair",
  "chairs",
  "couch",
  "couches",
  "curtain",
  "curtains",
  "cushion",
  "drape",
  "drapes",
  "loveseat",
  "ottoman",
  "pillow",
  "rug",
  "sectional",
  "sofa",
  "sofas",
  "stool",
]);

const BLOCKED = new Set(["redesign", "makeover"]);

function foldToken(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "");
}

function tokensOf(raw: string): string[] {
  return raw
    .trim()
    .split(/[^a-zA-Z0-9-]+/)
    .map(foldToken)
    .filter((token) => token.length > 0);
}

/** Color, fabric, material, or a short material-led phrase. Else null. */
export function normalizeLookQuery(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ");
  if (cleaned.length < 2 || cleaned.length > 80) {
    return null;
  }

  const tokens = tokensOf(cleaned);
  if (tokens.length === 0 || tokens.some((token) => BLOCKED.has(token))) {
    return null;
  }

  const hasMaterial = tokens.some((token) => MATERIALS.has(token));
  const hasColor = tokens.some((token) => COLORS.has(token));
  if (!hasMaterial && !hasColor) {
    return null;
  }

  const kept = tokens.filter((token) => {
    if (MATERIALS.has(token) || COLORS.has(token) || MODIFIERS.has(token)) {
      return true;
    }
    return hasMaterial && FURNITURE.has(token);
  });
  if (kept.length === 0) {
    return null;
  }
  return kept.slice(0, 6).join(" ");
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
