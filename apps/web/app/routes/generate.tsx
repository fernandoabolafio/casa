import { Outlet } from "react-router";

import type { Route } from "./+types/generate";

import { requirePageUser } from "~/lib/require-auth";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requirePageUser(request, context);
  return {};
}

export default function GenerateLayout() {
  return <Outlet />;
}
