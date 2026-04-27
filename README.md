# Casa Home Design

A local Next.js MVP for canvas-based home design exploration. Drop room photos, floor plans, inspiration images, and generated outputs onto a freeform tldraw board, then select any image set to generate a new interior scene back onto the same canvas.

## Setup

This project uses regular Node.js with npm. Do not install dependencies with Bun, pnpm, or Yarn; `package-lock.json` is the source of truth for dependency resolution.

Prerequisites:

- Node.js 20.9 or newer.
- npm 11 or newer.
- API keys for whichever image providers you plan to use.

```bash
cp .env.local.example .env.local
npm install
npm run dev
```

Open http://localhost:3000 after the dev server starts.

## Environment Variables

Create `.env.local` from `.env.local.example` and fill in the keys you need:

```bash
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
```

- `OPENAI_API_KEY` is required when using the OpenAI provider.
- `GEMINI_API_KEY` is required when using the Gemini provider.
- `GOOGLE_API_KEY` can be used as a fallback for Gemini if `GEMINI_API_KEY` is not set.

Keep real API keys in `.env.local`; do not commit local environment files.

## Canvas Workflow

- Drop or choose image files to add them as movable, resizable tldraw image shapes.
- Mark one selected image as the base, optionally mark selected images as references, and leave the rest as inspirations.
- Add a design prompt and optional queued instructions.
- Click `Generate` in the side panel or the contextual on-canvas action bubble.
- The generated result is inserted back into the board as another image shape.

## Image Generation Workflow

- `/api/generate-scene` sends selected canvas images to either OpenAI or Gemini, depending on the provider selected in the UI.
- `/api/edit-scene` remains available for masked edit work on a selected generated image through OpenAI.
- Draft renders default well to `quality: "low"`; switch to `medium` or `high` for slower final renders.

## Verify

```bash
npm run typecheck
npm run lint
npm run verify
```
