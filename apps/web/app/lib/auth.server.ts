import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";

import { createDb } from "~/db/client";
import * as schema from "~/db/schema";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
};

// Copied from joga-app `backend/src/auth.ts`: betterAuth + drizzleAdapter
// (sqlite) + emailAndPassword + bearer() + basePath "/api/auth".
// Casa mounts this on the same RR worker instead of a Hono service.
export function createAuth(env: Env, request?: Request) {
  const requestOrigin = request ? new URL(request.url).origin : undefined;
  const trustedOrigins = [
    env.PUBLIC_WEB_URL,
    env.BETTER_AUTH_URL,
    requestOrigin,
    request?.headers.get("origin") ?? undefined,
  ].filter((value, index, list): value is string => {
    return Boolean(value) && list.indexOf(value) === index;
  });

  const auth = betterAuth({
    database: drizzleAdapter(createDb(env), {
      provider: "sqlite",
      schema,
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL || requestOrigin,
    basePath: "/api/auth",
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
    },
    plugins: [bearer()],
  });

  return {
    handler: (incoming: Request) => auth.handler(incoming),
    getSession: async (headers: Headers): Promise<SessionUser | null> => {
      const session = await auth.api.getSession({ headers });
      if (!session?.user) {
        return null;
      }
      return {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
      };
    },
  };
}
