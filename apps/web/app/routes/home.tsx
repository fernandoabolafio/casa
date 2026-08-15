import { useEffect } from "react";
import { Link, redirect, useRevalidator } from "react-router";

import type { Route } from "./+types/home";

import { signOut } from "~/lib/auth";
import { composePath, jobTitle, primaryActionClass } from "~/lib/compose";
import { getEnv } from "~/lib/env.server";
import {
  listUserGenerations,
  userHasGenerations,
  type GenerationJob,
} from "~/lib/generations.server";
import { getSession } from "~/lib/require-auth";
import { formatAgo } from "~/lib/relative-time";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await getSession(request, context);
  if (!user) {
    return { signedIn: false as const };
  }

  const env = getEnv(context);
  const hasJobs = await userHasGenerations(env, user.id);
  if (!hasJobs) {
    throw redirect("/generate/room");
  }

  const jobs = await listUserGenerations(env, user.id);
  return {
    signedIn: true as const,
    jobs,
    now: Date.now(),
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  if (!loaderData.signedIn) {
    return <Landing />;
  }
  return <HomeJobs jobs={loaderData.jobs} now={loaderData.now} />;
}

function Landing() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <p className="text-sm tracking-wide text-[var(--color-accent)]">Casa</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        Home design, from a photo.
      </h1>
      <p className="mt-4 max-w-lg text-[var(--color-muted)]">
        Upload a room photo, generate, pick a winner. That winner is the next
        room.
      </p>
      <p className="mt-8 flex flex-wrap gap-3">
        <Link
          to="/sign-in?next=/"
          className="inline-block rounded-md bg-[var(--color-accent)] px-4 py-2 font-medium text-[var(--color-page)]"
        >
          Sign in
        </Link>
        <Link
          to="/sign-up?next=/"
          className="inline-block rounded-md border border-[var(--color-accent)] px-4 py-2 font-medium text-[var(--color-accent)]"
        >
          Create an account
        </Link>
      </p>
    </main>
  );
}

function HomeJobs({ jobs, now }: { jobs: GenerationJob[]; now: number }) {
  const revalidator = useRevalidator();
  const running = jobs.filter((job) => job.status === "running");
  const finished = jobs.filter((job) => job.status !== "running");
  const latestWinnerId =
    finished.find((job) => job.status === "done" && job.result)?.id ?? null;

  useEffect(() => {
    if (running.length === 0) {
      return;
    }
    const timer = window.setInterval(() => {
      void revalidator.revalidate();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [running.length, revalidator]);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-8">
      <header className="flex items-center justify-between gap-4">
        <p className="text-sm tracking-wide">Casa</p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="text-xs text-[var(--color-muted)] underline"
            onClick={() => {
              void signOut().then(() => window.location.assign("/"));
            }}
          >
            Sign out
          </button>
          <Link
            to="/generate/room"
            className="rounded-md border border-[var(--color-accent)] px-3 py-1.5 text-sm text-[var(--color-accent)]"
          >
            New generation
          </Link>
        </div>
      </header>

      {running.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-sm text-[var(--color-muted)]">Running</h2>
          <ul className="mt-3 space-y-3">
            {running.map((job) => (
              <li
                key={job.id}
                className="flex items-center gap-4 rounded-lg border border-[var(--color-muted)]/30 p-3"
              >
                {job.base ? (
                  <img
                    src={job.base.url}
                    alt=""
                    className="h-16 w-16 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded border border-[var(--color-muted)]/30 text-xs text-[var(--color-muted)]">
                    …
                  </div>
                )}
                <div>
                  <p className="text-lg">Generating...</p>
                  <p className="mt-1 text-sm text-[var(--color-muted)]">
                    {job.prompt.trim() || "No extra direction"}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    Started {formatAgo(job.createdAt, now)} · you can leave
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {finished.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-sm text-[var(--color-muted)]">Done</h2>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {finished.map((job) => (
              <DoneCard
                key={job.id}
                job={job}
                now={now}
                featured={job.id === latestWinnerId}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

function DoneCard({
  job,
  now,
  featured,
}: {
  job: GenerationJob;
  now: number;
  featured: boolean;
}) {
  if (job.status === "failed") {
    return (
      <li className="overflow-hidden rounded-lg border border-[var(--color-muted)]/30">
        <div className="flex aspect-[4/3] items-center justify-center bg-black/20 px-4 text-sm text-[var(--color-muted)]">
          Failed
        </div>
        <div className="p-3">
          <p className="text-sm">{jobTitle(job.prompt)}</p>
          <p className="mt-2 text-xs text-[var(--color-accent)]">
            {job.error ?? "Generation failed."}
          </p>
        </div>
      </li>
    );
  }

  const preview = job.result ?? job.base;
  const promoteHref = job.result
    ? composePath("looks", { baseId: job.result.id })
    : null;

  return (
    <li
      className={`overflow-hidden rounded-lg border ${
        featured
          ? "border-[var(--color-accent)]"
          : "border-[var(--color-muted)]/30"
      }`}
    >
      {preview && promoteHref ? (
        <Link to={promoteHref}>
          <img
            src={preview.url}
            alt={jobTitle(job.prompt)}
            className="aspect-[4/3] w-full object-cover"
          />
        </Link>
      ) : preview ? (
        <img
          src={preview.url}
          alt={jobTitle(job.prompt)}
          className="aspect-[4/3] w-full object-cover"
        />
      ) : (
        <div className="aspect-[4/3] bg-black/20" />
      )}
      <div className="p-3">
        <p className="text-sm">{jobTitle(job.prompt)}</p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          {formatAgo(job.createdAt, now)}
        </p>
        {promoteHref ? (
          <Link to={promoteHref} className={`${primaryActionClass} mt-3 w-full`}>
            Use as base
          </Link>
        ) : null}
      </div>
    </li>
  );
}
