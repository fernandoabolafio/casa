import { redirect } from "react-router";

import type { Route } from "./+types/sign-up";

import { AuthForm } from "~/components/auth-form";
import { getOptionalUser } from "~/lib/session.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const nextPath = new URL(request.url).searchParams.get("next") ?? "/generate";
  const user = await getOptionalUser(request, context);
  if (user) {
    throw redirect(nextPath);
  }
  return { nextPath };
}

export default function SignUp({ loaderData }: Route.ComponentProps) {
  return <AuthForm mode="sign-up" nextPath={loaderData.nextPath} />;
}
