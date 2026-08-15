import { redirect, type RouterContextProvider } from "react-router";

import { createAuth } from "~/lib/auth.server";
import { getEnv } from "~/lib/env.server";

type RequestContext = Pick<RouterContextProvider, "get">;

export async function getOptionalUser(
  request: Request,
  context: RequestContext,
) {
  const env = getEnv(context);
  const auth = createAuth(env, request);
  return auth.getSession(request.headers);
}

export async function requireUser(
  request: Request,
  context: RequestContext,
  redirectTo = "/sign-in",
) {
  const user = await getOptionalUser(request, context);
  if (!user) {
    const next = new URL(request.url).pathname;
    throw redirect(`${redirectTo}?next=${encodeURIComponent(next)}`);
  }
  return user;
}
