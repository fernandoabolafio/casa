import { redirect, type RouterContextProvider } from "react-router";

import { createAuth, type SessionUser } from "~/lib/auth.server";
import { getEnv } from "~/lib/env.server";

type RequestContext = Pick<RouterContextProvider, "get">;

// Copied from joga-app `backend/src/middleware/auth.ts`:
// `auth.api.getSession({ headers })`.
export async function getSession(
  request: Request,
  context: RequestContext,
): Promise<SessionUser | null> {
  const auth = createAuth(getEnv(context), request);
  return auth.getSession(request.headers);
}

export async function requireAuth(
  request: Request,
  context: RequestContext,
): Promise<SessionUser> {
  const user = await getSession(request, context);
  if (!user) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return user;
}

export async function requirePageUser(
  request: Request,
  context: RequestContext,
  redirectTo = "/sign-in",
): Promise<SessionUser> {
  const user = await getSession(request, context);
  if (!user) {
    const next = new URL(request.url).pathname;
    throw redirect(`${redirectTo}?next=${encodeURIComponent(next)}`);
  }
  return user;
}
