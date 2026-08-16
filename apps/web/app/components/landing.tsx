import { Link } from "react-router";

import { Wordmark } from "~/components/wordmark";
import { headingClass } from "~/lib/brand";
import { primaryActionClass, secondaryActionClass } from "~/lib/compose";

export function Landing() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <Wordmark />
      <h1 className={`mt-3 text-4xl ${headingClass}`}>
        Home design, from a photo.
      </h1>
      <p className="mt-4 max-w-lg text-[var(--muted)]">
        Take a photo of the room you're sitting in. Each new picture starts from the last one you liked.
      </p>
      <p className="mt-4 max-w-lg text-lg">
        See your room with the new sofa. Then keep going.
      </p>

      <figure className="mt-10">
        <div className="grid gap-3 sm:grid-cols-2">
          <ProofShot
            src="/proof/sofa-base.jpg"
            label="Base"
            alt="The room photo before a generation"
          />
          <ProofShot
            src="/proof/sofa-winner.jpg"
            label="Winner"
            alt="The generated room"
          />
        </div>
        <figcaption className="mt-4 text-sm text-[var(--muted)]">
          Use as base → next room
        </figcaption>
      </figure>


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
      <p className="mt-2 text-center text-[10px] uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
    </div>
  );
}
