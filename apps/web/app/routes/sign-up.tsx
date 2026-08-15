import { redirect } from "react-router";

import type { Route } from "./+types/sign-up";

import { AuthForm } from "~/components/auth-form";
import { getSession } from "~/lib/require-auth";

export async function loader({ request, context }: Route.LoaderArgs) {
  const nextPath = new URL(request.url).searchParams.get("next") ?? "/";
  const user = await getSession(request, context);
  if (user) {
    throw redirect(nextPath);
  }
  return { nextPath };
}

export default function SignUp({ loaderData }: Route.ComponentProps) {
  return <AuthForm mode="sign-up" nextPath={loaderData.nextPath} />;
}
