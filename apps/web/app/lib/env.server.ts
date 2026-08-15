import type { RouterContextProvider } from "react-router";

import { cloudflareContext } from "~/cloudflare-context";

type RequestContext = Pick<RouterContextProvider, "get">;

export function getEnv(context: RequestContext): Env {
  const cloudflare = context.get(cloudflareContext);
  if (!cloudflare) {
    throw new Error("Cloudflare context is missing from the request.");
  }
  return cloudflare.env;
}
