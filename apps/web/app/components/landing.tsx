import { Link } from "react-router";

import { primaryActionClass, secondaryActionClass } from "~/lib/compose";

export function Landing() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <p className="text-sm tracking-wide text-[var(--color-accent)]">Casa</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        Home design, from a photo.
      </h1>
      <p className="mt-4 max-w-lg text-[var(--color-muted)]">
        Upload a room photo, generate, pick a winner. That winner is the next
        room.
      </p>
      <p className="mt-4 max-w-lg text-lg">
        See your room with the new sofa. Then keep going.
      </p>

      <figure className="mt-10">
        <div className="grid gap-3 sm:grid-cols-2">
          <ProofShot
            src="/proof/base.jpg"
            label="Base"
            alt="The room photo before a generation"
          />
          <ProofShot
            src="/proof/winner.jpg"
            label="Winner"
            alt="The generated room"
          />
        </div>
        <figcaption className="mt-4 text-sm text-[var(--color-muted)]">
          Use as base → next room
        </figcaption>
      </figure>

      <p className="mt-6 max-w-lg text-sm text-[var(--color-muted)]">
        Steal a look — style only, will not move your windows.
      </p>

      <p className="mt-10 flex flex-wrap gap-3">
        <Link
          to="/sign-up?next=/generate/room"
          className={primaryActionClass}
        >
          Create an account
        </Link>
        <Link to="/sign-in?next=/" className={secondaryActionClass}>
          Sign in
        </Link>
      </p>
    </main>
  );
}

function ProofShot({
  src,
  label,
  alt,
}: {
  src: string;
  label: string;
  alt: string;
}) {
  return (
    <div>
      <img
        src={src}
        alt={alt}
        className="aspect-[4/3] w-full rounded-lg object-cover"
      />
      <p className="mt-2 text-center text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
        {label}
      </p>
    </div>
  );
}
