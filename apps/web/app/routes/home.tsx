import { Link } from "react-router";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <p className="text-sm tracking-wide text-[var(--color-accent)]">Casa</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        Home design, from a prompt.
      </h1>
      <p className="mt-4 max-w-lg text-[var(--color-muted)]">
        This is the product app. Generate and edit interior scenes from here.
        The tldraw canvas in <code>@casa/canvas</code> stays as a reference
        while this UI is built.
      </p>
      <p className="mt-8">
        <Link
          to="/generate"
          className="inline-block rounded-md bg-[var(--color-accent)] px-4 py-2 font-medium text-[var(--color-page)]"
        >
          Open generate
        </Link>
      </p>
    </main>
  );
}
