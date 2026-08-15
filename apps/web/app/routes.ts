import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("generate", "routes/generate.tsx"),
  route("api/generate-scene", "routes/api.generate-scene.ts"),
  route("api/edit-scene", "routes/api.edit-scene.ts"),
  route("api/transcribe", "routes/api.transcribe.ts"),
  route("api/prompt-history", "routes/api.prompt-history.ts"),
] satisfies RouteConfig;
