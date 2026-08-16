import type { ReactNode } from "react";

import { Wordmark } from "~/components/wordmark";
import { signOut } from "~/lib/auth";

export function ComposeChrome({
  stepLabel,
  children,
  flush = false,
}: {
  stepLabel?: string;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <div
      className={
        flush
          ? "mx-auto flex h-dvh max-w-5xl flex-col overflow-hidden px-6 pt-4"
          : "mx-auto min-h-screen max-w-5xl px-6 pb-16 pt-6"
      }
    >
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--muted)]/20 pb-3">
        <Wordmark to="/" />
        <div className="flex items-center gap-4">
          {stepLabel ? (
            <p className="text-xs text-[var(--muted)]">{stepLabel}</p>
          ) : null}
          <button
            type="button"
            className="text-xs text-[var(--muted)] underline"
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
