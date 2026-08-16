import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";

import { Wordmark } from "~/components/wordmark";
import { signInEmail, signUpEmail } from "~/lib/auth";
import { headingClass } from "~/lib/brand";

type AuthMode = "sign-in" | "sign-up";

const fieldClass =
  "mt-2 w-full rounded-md border border-[var(--muted)]/40 bg-transparent px-3 py-2 text-[var(--ink)] placeholder:text-[var(--muted)]";

export function AuthForm({
  mode,
  nextPath,
}: {
  mode: AuthMode;
  nextPath: string;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      if (mode === "sign-up") {
        await signUpEmail(name, email, password);
      } else {
        await signInEmail(email, password);
      }
      navigate(nextPath);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Authentication failed.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <Wordmark to="/" />
      <h1 className={`mt-3 text-3xl ${headingClass}`}>
        {mode === "sign-up" ? "Create an account" : "Sign in"}
      </h1>
      <p className="mt-3 text-[var(--muted)]">
        Email and password. Images you upload stay on your account.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        {mode === "sign-up" ? (
          <label className="block text-sm">
            Name
            <input
              className={fieldClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              autoComplete="name"
            />
          </label>
        ) : null}
        <label className="block text-sm">
          Email
          <input
            className={fieldClass}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            className={fieldClass}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            autoComplete={
              mode === "sign-up" ? "new-password" : "current-password"
            }
          />
        </label>
        {error ? <p className="text-sm text-[var(--clay)]">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--clay)] px-4 py-2 font-medium text-[var(--plaster)] disabled:opacity-50"
        >
          {pending
            ? "Working…"
            : mode === "sign-up"
              ? "Sign up"
              : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-sm text-[var(--muted)]">
        {mode === "sign-up" ? (
          <>
            Already have an account?{" "}
            <Link
              to={`/sign-in?next=${encodeURIComponent(nextPath)}`}
              className="text-[var(--clay)]"
            >
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link
              to={`/sign-up?next=${encodeURIComponent(nextPath)}`}
              className="text-[var(--clay)]"
            >
              Create an account
            </Link>
          </>
        )}
      </p>
    </main>
  );
}
