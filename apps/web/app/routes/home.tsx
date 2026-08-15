import { Link } from "react-router";

import type { Route } from "./+types/home";

import { getSession } from "~/lib/require-auth";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await getSession(request, context);
  return { signedIn: Boolean(user) };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <p className="text-sm tracking-wide text-[var(--color-accent)]">Casa</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        Home design, from a prompt.
      </h1>
      <p className="mt-4 max-w-lg text-[var(--color-muted)]">
        Upload room photos, pick a working set, generate later. The tldraw
        canvas in <code>@casa/canvas</code> stays as a reference.
      </p>
      <p className="mt-8 flex flex-wrap gap-3">
        {loaderData.signedIn ? (
          <Link
            to="/generate"
            className="inline-block rounded-md bg-[var(--color-accent)] px-4 py-2 font-medium text-[var(--color-page)]"
          >
            Open working set
          </Link>
        ) : (
          <>
            <Link
              to="/sign-in?next=/generate"
              className="inline-block rounded-md bg-[var(--color-accent)] px-4 py-2 font-medium text-[var(--color-page)]"
            >
              Sign in
            </Link>
            <Link
              to="/sign-up?next=/generate"
              className="inline-block rounded-md border border-[var(--color-accent)] px-4 py-2 font-medium text-[var(--color-accent)]"
            >
              Create an account
            </Link>
          </>
        )}
      </p>
    </main>
  );
}
