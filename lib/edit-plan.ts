export type Intent =
  | "keep"
  | "remove"
  | "recolor"
  | "swap"
  | "restyle";

export const EDITABLE_INTENTS: Array<Exclude<Intent, "keep">> = [
  "remove",
  "recolor",
  "swap",
  "restyle",
];

export type EditToken = {
  id: string;
  label: string;
  intent: Intent;
  instruction: string;
  mask: { width: number; height: number; data: Uint8Array };
  createdAt: number;
};

export type SceneImage = {
  dataUrl: string;
  width: number;
  height: number;
};

export type HistoryStep = {
  id: string;
  tokenLabel: string;
  intent: Intent;
  instruction: string;
  before: string;
  after: string;
  diffOverlay: string;
  changedPct: number;
};

export function intentVerb(intent: Intent): string {
  switch (intent) {
    case "remove":
      return "Remove";
    case "recolor":
      return "Recolor";
    case "swap":
      return "Swap";
    case "restyle":
      return "Restyle";
    case "keep":
      return "Keep";
  }
}

export function intentToInstruction(intent: Intent, instruction: string): string {
  const detail = instruction.trim();
  switch (intent) {
    case "remove":
      return "Remove this object completely and realistically fill the area behind it so it blends with the surrounding room.";
    case "recolor":
      return detail
        ? `Recolor this object to ${detail}. Keep its exact shape, position, material finish, and lighting.`
        : "Recolor this object while keeping its exact shape, position, material finish, and lighting.";
    case "swap":
      return detail
        ? `Replace this object with ${detail}. Match the camera angle, scale, perspective, and lighting of the original.`
        : "Replace this object with a tasteful alternative that matches the camera angle, scale, perspective, and lighting of the original.";
    case "restyle":
      return detail
        ? `Restyle this object in a ${detail} style. Keep its position, footprint, and the room's lighting.`
        : "Restyle this object while keeping its position, footprint, and the room's lighting.";
    case "keep":
      return "Keep this object exactly as-is.";
  }
}
