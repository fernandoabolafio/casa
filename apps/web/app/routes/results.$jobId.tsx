import { Link, redirect } from "react-router";

import type { Route } from "./+types/results.$jobId";

import { ResultInspect } from "~/components/result-inspect";
import { roomDownloadName } from "~/lib/brand";
import { composePath } from "~/lib/compose";
import { getEnv } from "~/lib/env.server";
import {
  ensureShareToken,
  getUserGenerationJob,
} from "~/lib/generations.server";
import { requirePageUser } from "~/lib/require-auth";
import { sharePath } from "~/lib/share";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = await requirePageUser(request, context);
  const env = getEnv(context);
  const job = await getUserGenerationJob(env, user.id, params.jobId);
  if (!job?.result) {
    throw redirect("/");
  }
  const token = await ensureShareToken(env, job.id);
  const shareUrl = new URL(sharePath(token), request.url).href;
  return { job, shareUrl };
}

export default function ResultView({ loaderData }: Route.ComponentProps) {
  const { job, shareUrl } = loaderData;
  const image = job.result;
  if (!image) {
    return null;
  }

  const promoteHref = composePath("looks", { baseId: image.id });

  return (
    <ResultInspect
      prompt={job.prompt}
      imageUrl={image.url}
      filename={image.filename || roomDownloadName(job.id)}
      shareUrl={shareUrl}
      base={job.base}
      looks={job.inspirations}
      backHref="/"
      promoteHref={promoteHref}
      secondary={
        <p className="mt-3 flex flex-wrap gap-4 text-sm">
          <Link
            to="/generate/room"
            className="text-[var(--muted)] underline"
          >
            New generation
          </Link>
        </p>
      }
    />
  );
}
