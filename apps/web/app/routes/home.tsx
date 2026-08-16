import { useEffect, useRef, useState } from "react";
import { Link, redirect, useFetcher } from "react-router";

import type { Route } from "./+types/home";

import { Landing } from "~/components/landing";
import { Wordmark } from "~/components/wordmark";
import { signOut } from "~/lib/auth";
import { composePath, jobTitle, primaryActionClass } from "~/lib/compose";
import { getEnv } from "~/lib/env.server";
import {
  listUserGenerations,
  userHasGenerations,
  type GenerationJob,
} from "~/lib/generations.server";
import { getSession } from "~/lib/require-auth";
import { formatAgo, formatElapsed } from "~/lib/relative-time";

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

type JobsPayload = {
  jobs: GenerationJob[];
  now: number;
};

function HomeJobs({
  jobs: loaderJobs,
  now: loaderNow,
}: {
  jobs: GenerationJob[];
  now: number;
}) {
  const fetcher = useFetcher<JobsPayload>();
  const jobs = fetcher.data?.jobs ?? loaderJobs;
  const now = fetcher.data?.now ?? loaderNow;
  const running = jobs.filter((job) => job.status === "running");
  const finished = jobs.filter((job) => job.status !== "running");
  const latestWinnerId =
    finished.find((job) => job.status === "done" && job.result)?.id ?? null;
  const hasRunning = running.length > 0;
  const pollRef = useRef(fetcher);

  useEffect(() => {
    pollRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    if (!hasRunning) {
      return;
    }
    function tick() {
      void pollRef.current.load("/api/jobs");
    }
    tick();
    const timer = window.setInterval(tick, 2000);
    return () => window.clearInterval(timer);
  }, [hasRunning]);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-8">
      <header className="flex items-center justify-between gap-4">
        <Wordmark />
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="text-xs text-[var(--muted)] underline"
            onClick={() => {
              void signOut().then(() => window.location.assign("/"));
            }}
          >
            Sign out
          </button>
          <Link
            to="/generate/room"
            className="rounded-md border border-[var(--clay)] px-3 py-1.5 text-sm text-[var(--clay)]"
          >
            New generation
          </Link>
        </div>
      </header>

      {running.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-sm text-[var(--muted)]">Running</h2>
          <ul className="mt-3 space-y-3">
            {running.map((job) => (
              <li
                key={job.id}
                className="flex items-center gap-4 rounded-lg border border-[var(--muted)]/30 p-3"
              >
                {job.base ? (
                  <img
                    src={job.base.url}
                    alt=""
                    className="h-16 w-16 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded border border-[var(--muted)]/30 text-xs text-[var(--muted)]">
                    …
                  </div>
                )}
                <div>
                  <p className="text-lg">Generating one image</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {job.prompt.trim() || "No extra direction"}
                  </p>
                  <RunningWait startedAt={job.createdAt} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {finished.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-sm text-[var(--muted)]">Done</h2>
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

function RunningWait({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <p className="mt-1 text-xs text-[var(--muted)]">
      {formatElapsed(startedAt, now)} · about a minute. You can leave and come
      back.
    </p>
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
      <li className="overflow-hidden rounded-lg border border-[var(--muted)]/30">
        <div className="flex aspect-[4/3] items-center justify-center bg-[var(--ink)]/8 px-4 text-sm text-[var(--muted)]">
          Failed
        </div>
        <div className="p-3">
          <p className="text-sm">{jobTitle(job.prompt)}</p>
          <p className="mt-2 text-xs text-[var(--clay)]">
            {job.error ?? "Generation failed."}
          </p>
        </div>
      </li>
    );
  }

  const preview = job.result ?? job.base;
  const resultHref = job.result ? `/results/${job.id}` : null;
  const promoteHref = job.result
    ? composePath("looks", { baseId: job.result.id })
    : null;

  return (
    <li
      className={`overflow-hidden rounded-lg border ${
        featured
          ? "border-[var(--lamp)]"
          : "border-[var(--muted)]/30"
      }`}
    >
      {preview && resultHref ? (
        <Link to={resultHref}>
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
        <div className="aspect-[4/3] bg-[var(--ink)]/8" />
      )}
      <div className="p-3">
        <p className="text-sm">{jobTitle(job.prompt)}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
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
