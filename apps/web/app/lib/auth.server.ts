import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";

import { createDb } from "~/db/client";
import * as schema from "~/db/schema";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
};

function collectTrustedOrigins(env: Env, request: Request) {
  const origins = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (value) {
      origins.add(value);
    }
  };

  add(env.BETTER_AUTH_URL);
  add(new URL(request.url).origin);
  add(request.headers.get("origin"));
  add("http://localhost:5173");
  add("http://localhost:5174");
  add("http://127.0.0.1:5173");
  add("http://127.0.0.1:5174");
  return [...origins];
}

export function createAuth(env: Env, request: Request) {
  const origin = new URL(request.url).origin;
  const auth = betterAuth({
    database: drizzleAdapter(createDb(env), {
      provider: "sqlite",
      schema,
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL || origin,
    emailAndPassword: {
      enabled: true,
    },
    trustedOrigins: collectTrustedOrigins(env, request),
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
