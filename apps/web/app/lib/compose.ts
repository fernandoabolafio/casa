export const LOOK_CAP = 4;

/** Same rank as Generate. Use for promote verbs too. */
export const primaryActionClass =
  "inline-flex items-center justify-center rounded-md bg-[var(--color-accent)] px-4 py-2 font-medium text-[var(--color-page)] disabled:opacity-50";

export const secondaryActionClass =
  "inline-flex items-center justify-center rounded-md border border-[var(--color-ink)]/70 px-4 py-2 text-sm";

export type ComposeStep = "room" | "looks" | "mosaic";

export type ComposeState = {
  baseId: string | null;
  lookIds: string[];
  structureLock: boolean;
};

export function parseCompose(url: URL): ComposeState {
  const baseId = url.searchParams.get("base");
  const looks = url.searchParams.get("looks");
  const lock = url.searchParams.get("lock");
  return {
    baseId: baseId && baseId.length > 0 ? baseId : null,
    lookIds: looks
      ? looks.split(",").filter((id) => id.length > 0).slice(0, LOOK_CAP)
      : [],
    structureLock: lock !== "0",
  };
}

export function composePath(
  step: ComposeStep,
  state: Partial<ComposeState>,
): string {
  const params = new URLSearchParams();
  if (state.baseId) {
    params.set("base", state.baseId);
  }
  if (state.lookIds && state.lookIds.length > 0) {
    params.set("looks", state.lookIds.slice(0, LOOK_CAP).join(","));
  }
  if (state.structureLock === false) {
    params.set("lock", "0");
  }
  const query = params.toString();
  return query ? `/generate/${step}?${query}` : `/generate/${step}`;
}

export function jobTitle(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return "Untitled";
  }
  return trimmed.length > 42 ? `${trimmed.slice(0, 41)}…` : trimmed;
}
