// Copied from joga-app `web/app/lib/auth.ts`: same Better Auth HTTP paths.

const AUTH_BASE = "/api/auth";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

type AuthErrorBody = {
  message?: string;
  code?: string;
};

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as AuthErrorBody;
    return body.message ?? "Authentication failed.";
  } catch {
    return "Authentication failed.";
  }
}

export async function getSession(): Promise<AuthUser | null> {
  const response = await fetch(`${AUTH_BASE}/get-session`, {
    credentials: "include",
  });
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as { user?: AuthUser | null } | null;
  return body?.user ?? null;
}

export async function signInEmail(email: string, password: string) {
  const response = await fetch(`${AUTH_BASE}/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json();
}

export async function signUpEmail(
  name: string,
  email: string,
  password: string,
) {
  const response = await fetch(`${AUTH_BASE}/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name, email, password }),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json();
}

export async function signOut() {
  const response = await fetch(`${AUTH_BASE}/sign-out`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
}
