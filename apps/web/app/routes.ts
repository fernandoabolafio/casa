import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("generate", "routes/generate.tsx", [
    index("routes/generate._index.tsx"),
    route("room", "routes/generate.room.tsx"),
    route("looks", "routes/generate.looks.tsx"),
    route("mosaic", "routes/generate.mosaic.tsx"),
  ]),
  route("results/:jobId", "routes/results.$jobId.tsx"),
  route("sign-in", "routes/sign-in.tsx"),
  route("sign-up", "routes/sign-up.tsx"),
  route("api/auth/*", "routes/api.auth.$.ts"),
  route("api/images", "routes/api.images.ts"),
  route("api/images/:id", "routes/api.images.$id.ts"),
  route("api/jobs", "routes/api.jobs.ts"),
  route("api/generate-scene", "routes/api.generate-scene.ts"),
  route("api/edit-scene", "routes/api.edit-scene.ts"),
  route("api/transcribe", "routes/api.transcribe.ts"),
  route("api/prompt-history", "routes/api.prompt-history.ts"),
] satisfies RouteConfig;
