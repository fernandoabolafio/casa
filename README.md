# Casa Home Design

A local Next.js MVP for canvas-based home design exploration. Drop room photos, floor plans, inspiration images, and generated outputs onto a freeform tldraw board, then select any image set to generate a new interior scene back onto the same canvas.

## Setup

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Set `OPENAI_API_KEY` in `.env.local` before using generation requests.

## Canvas Workflow

- Drop or choose image files to add them as movable, resizable tldraw image shapes.
- Select one or more image shapes to use them as OpenAI reference images.
- Add a design prompt and optional queued instructions.
- Click `Generate` in the side panel or the contextual on-canvas action bubble.
- The OpenAI result is inserted back into the board as another image shape.

## OpenAI Workflow

- `/api/generate-scene` sends selected canvas images as references through the OpenAI Responses API image-generation tool.
- `/api/edit-scene` remains available for future masked edit work on a selected generated image.
- Draft renders default well to `quality: "low"`; switch to `medium` or `high` for slower final renders.

## Verify

```bash
npm run typecheck
npm run lint
npm run verify
```
