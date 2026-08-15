const STORAGE_KEY = "casa.promptHistory";
const MAX_PROMPT_HISTORY = 20;

export function loadPromptHistory(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

export function savePromptHistory(history: string[]) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(history.slice(0, MAX_PROMPT_HISTORY)),
    );
  } catch {
    // ignore quota / private mode
  }
}

export function addToPromptHistory(history: string[], prompt: string): string[] {
  const trimmed = prompt.trim();
  if (!trimmed) return history;

  return [trimmed, ...history.filter((entry) => entry !== trimmed)].slice(
    0,
    MAX_PROMPT_HISTORY,
  );
}

export function rememberPrompt(prompt: string): string[] {
  const next = addToPromptHistory(loadPromptHistory(), prompt);
  savePromptHistory(next);
  return next;
}
