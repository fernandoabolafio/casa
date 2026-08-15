import type { ReactNode } from "react";
import { Link } from "react-router";

import { signOut } from "~/lib/auth";

export function ComposeChrome({
  stepLabel,
  children,
}: {
  stepLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto min-h-screen max-w-5xl px-6 pb-16 pt-6">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--color-muted)]/20 pb-4">
        <Link to="/" className="text-sm tracking-wide text-[var(--color-ink)]">
          Casa
        </Link>
        <div className="flex items-center gap-4">
          {stepLabel ? (
            <p className="text-xs text-[var(--color-muted)]">{stepLabel}</p>
          ) : null}
          <button
            type="button"
            className="text-xs text-[var(--color-muted)] underline"
            onClick={() => {
              void signOut().then(() => window.location.assign("/"));
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
