export const SHARE_TOKEN_PATTERN = /^[a-f0-9]{32}$/;

export function isShareToken(token: string): boolean {
  return SHARE_TOKEN_PATTERN.test(token);
}

export function sharePath(token: string): string {
  return `/s/${token}`;
}

export function shareImagePath(token: string, imageId: string): string {
  return `/s/${token}/i/${imageId}`;
}

export function createShareToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
