import { Link } from "react-router";

import type { Route } from "./+types/s.$token";

import { ResultInspect } from "~/components/result-inspect";
import { PRODUCT_NAME, roomDownloadName } from "~/lib/brand";
import { composePath, jobTitle } from "~/lib/compose";
import { getEnv } from "~/lib/env.server";
import { getSharedGenerationJob } from "~/lib/generations.server";
import { getSession } from "~/lib/require-auth";
import { sharePath } from "~/lib/share";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = getEnv(context);
  const shared = await getSharedGenerationJob(env, params.token);
  if (!shared?.job.result) {
    throw new Response("Not found", { status: 404 });
  }

  const user = await getSession(request, context);
  const isOwner = Boolean(user && user.id === shared.userId);
  const shareUrl = new URL(sharePath(params.token), request.url).href;
  const ogImageUrl = new URL(shared.job.result.url, request.url).href;

  return {
    job: shared.job,
    shareUrl,
    ogImageUrl,
    isOwner,
    signedIn: Boolean(user),
    title: jobTitle(shared.job.prompt),
  };
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) {
    return [{ title: PRODUCT_NAME }];
  }
  return [
    { title: `${loaderData.title} · ${PRODUCT_NAME}` },
    { property: "og:title", content: loaderData.title },
    { property: "og:image", content: loaderData.ogImageUrl },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: loaderData.title },
    { name: "apple-mobile-web-app-title", content: PRODUCT_NAME },
  ];
};

export default function SharedResult({ loaderData }: Route.ComponentProps) {
  const { job, shareUrl, isOwner, signedIn } = loaderData;
  const image = job.result;
  if (!image) {
    return null;
  }

  const promoteHref = composePath("looks", { baseId: image.id });
  const makeOwnHref = signedIn ? "/generate/room" : "/sign-up?next=/generate/room";

  return (
    <ResultInspect
      prompt={job.prompt}
      imageUrl={image.url}
      filename={image.filename || roomDownloadName(job.id)}
      shareUrl={shareUrl}
      base={job.base}
      looks={job.inspirations}
      backHref={isOwner ? "/" : undefined}
      promoteHref={isOwner ? promoteHref : undefined}
      secondary={
        isOwner ? (
          <p className="mt-3 flex flex-wrap gap-4 text-sm">
            <Link
              to="/generate/room"
              className="text-[var(--muted)] underline"
            >
              New generation
            </Link>
          </p>
        ) : (
          <p className="mt-3 text-sm">
            <Link to={makeOwnHref} className="text-[var(--muted)] underline">
              Make your own
            </Link>
          </p>
        )
      }
    />
  );
}
