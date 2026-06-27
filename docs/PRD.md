# Casa — Product Requirements Document
## Controllable interior redesign: from freeform canvas to structured, geometry-preserving edits

**Status:** Draft v1
**Owner:** Fernando
**Last updated:** 2026-06-26

---

## 1. Summary

Casa today is a freeform [tldraw](https://tldraw.dev) canvas where users drop a room photo (the *base*), optionally add *reference* and *inspiration* images, scribble freehand annotations, write a prompt, and generate a redesigned scene via OpenAI `gpt-5.5` or Gemini `gemini-3.1-flash-image-preview`. The output is too **random**: the model reinvents room geometry, camera angle, and untouched objects instead of applying *only* the requested design changes.

This PRD defines the replacement: a **structured, object-first redesign editor** that (a) lets users point at real objects/surfaces and assign explicit intents, (b) enforces "everything else stays identical," and (c) progressively adds true geometry locking. It is delivered in three phases that build on one shared substrate.

The diagnosis (from cross-model research): freeform strokes reach the model as *fuzzy pixels*, the image models honor reference images only *softly*, and nothing forces unchanged regions to remain identical. The fix is **structured intent + segmentation-based selection + masked edits + forced compositing + visible locks**, with depth/edge conditioning layered in for hard geometry preservation.

---

## 2. Goals & non-goals

### Goals
- **G1 — Strict scope.** When a user changes one object, every other pixel they didn't touch stays byte-identical.
- **G2 — Preserve room shape & camera.** Architecture (walls, windows, doors, ceiling, floor) and viewpoint are preserved by default; changing them is an explicit, opt-in action.
- **G3 — Point-and-direct UX.** Users select real objects/surfaces ("this sofa," "that wall") and say keep / remove / recolor / swap / restyle — no symbolic scribbling.
- **G4 — Visible trust.** The UI always shows what is locked vs. changing, and proves after generation that locks held.
- **G5 — Honest cross-angle transfer.** Support "my room photo + an architect's render of the same room at a different angle" via user-confirmed correspondence, transferring design attributes onto the base camera.

### Non-goals (this PRD)
- Full 3D reconstruction / re-projection of a room into a new camera (Gaussian splat / NeRF / SAM-3D). Parked as a research bet (§11).
- Multi-room / floor-plan-level planning.
- Real-time collaboration / multi-user canvas.
- Marketplace / product-purchase integration.

---

## 3. Users & key use cases

- **Homeowner restyling a room.** "Keep my living room exactly, just make the sofa olive green, remove the rug, and warm up the lighting."
- **Owner working from an architect render.** "Here's my real room and a 3D render the architect gave me (different angle). Apply that design — same walls, same camera."
- **Explorer / mood-boarder.** "Restyle this room toward this inspiration image, but don't move anything."

---

## 4. Current system (baseline to replace)

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript; tldraw 4 canvas (`components/design-*.tsx`). Deployed via OpenNext → Cloudflare.
- **Generation:** `lib/openai-images.ts` → `generateScene()` (multi-image prompt to `gpt-5.5` image tool or Gemini) and `editScene()` (masked edit via `gpt-image-2` `images.edit`).
- **Routes:** `POST /api/generate-scene`, `POST /api/edit-scene` (scene + mask PNG + instructions), `GET /api/providers`.
- **Masking:** `lib/image-mask.ts`, `lib/image-mask-core.ts`.
- **Constraint, confirmed by research:** Cloudflare Workers AI has **no** segmentation or depth models. All CV must run **in-browser (WebGPU)**, via a **hosted inference API** (fal.ai / Replicate), or a **separate Python/GPU service**. Cloudflare stays the orchestration + UI layer.

---

## 5. Solution overview — one product, three phases

A single **Object Control Room** editor is the chassis. Phase 1 ships the chassis with the existing backend. Phase 2 adds a natural-language intent layer as the primary way in. Phase 3 adds true geometry locking and the cross-angle correspondence flow.

```
Phase 1  ── Object Control Room (direct manipulation) ─────────────► ship in weeks
            click-to-select (WebGPU SAM) · intent chips · lock list
            · masked edit (existing gpt-image-2) · forced compositing
            · before/after + diff review

Phase 2  ── Command Plan (natural-language intent) ────────────────► biggest UX delight
            "keep layout, sofa olive, remove rug" → compiles into the
            SAME object tokens + locks · targeted clarifying questions

Phase 3  ── Anchor Mode (hard geometry lock + cross-angle) ────────► trust & wow
            Depth Anything V2 + M-LSD conditioning · ControlNet/Flux
            hard-lock path · structure-lock checklist · drift review
            · dual-pane user-confirmed correspondence transfer
```

All three phases read and write the **same core data structure** (`EditPlan`, §8), so each phase is additive, not a rewrite.

---

## 6. The shared mental model

The unit of work is not a canvas — it's an **Edit Plan**: a base image plus a set of **tokens** (detected objects/surfaces), each carrying an **intent** and **preservation flags**, plus a set of **global locks** (camera, room geometry, layout, lighting). Generation always means: apply each non-locked token's intent via a masked edit, then **composite the original pixels back everywhere outside the touched masks**.

This gives the model structured operations and gives the user a provable promise.

---

## 7. UX specification

### 7.1 Primary flow — single-photo restyle (Phase 1 + 2)

1. **Upload.** Clean start screen: a large image well and (Phase 2) a text box "What should change?". No canvas.
2. **Scan.** On upload, Casa segments the room into objects + surfaces (sofa, rug, table, walls, floor, ceiling, windows, doors) and shows them as a soft overlay + a right-side **Object Inventory** list. Everything defaults to **Keep / Locked**.
3. **Direct intent (Phase 1).** Hover an object → its mask highlights (bidirectional with the inventory row). Click → intent chips appear: `Keep` · `Remove` · `Recolor` · `Swap` · `Restyle` · `Use reference`. The selected mask can be refined with `+ add` / `− remove` brush and a feather slider.
4. **Conversational intent (Phase 2).** Instead of clicking, the user types/speaks: *"Remove the rug, make the sofa forest green, limewash the walls beige, keep the floor."* Casa compiles this into the same token intents and shows the resulting **Command Plan** for confirmation. Ambiguity → a narrow question ("Casa found two rugs — which one?") with highlighted candidates, never an open-ended chat dead-end.
5. **Review constraints.** Before generating, a two-column summary: **Changing** (sofa, rug, walls) vs **Locked** (floor, windows, camera, room shape).
6. **Generate.** One masked edit per changed token (auto-expanded + feathered mask), forced overlay compositing outside masks. 2–4 candidates.
7. **Review.** Before/after slider + variant filmstrip + **diff-highlight** that outlines only changed pixels, with a verification line: "Only the Sofa region changed. 5 locked objects verified identical." Actions: Accept / Regenerate this token / Discard.
8. **Iterate.** Each accepted edit is a reversible step in a linear history. Further edits operate on one token at a time.

### 7.2 Secondary flow — same room, different angle (Phase 3)

1. **Two images.** "This is my real room" (camera to preserve) + "This is the target design / architect render."
2. **Detect both.** Segment + extract depth/lines/room-shell for each.
3. **Confirm correspondence.** Casa proposes pairings (base window ↔ render window, base back wall ↔ render back wall, base floor ↔ render floor); the user clicks matching anchors where confidence is low. A minimum of N anchors (e.g. 4) is required to enable transfer.
4. **Choose transfer scope.** Chips: `Materials` · `Colors` · `Lighting mood` · `Furniture style` · `Decor`. **Layout** and **Camera angle** are OFF by default.
5. **Generate guarded transfer.** The render informs material/color/style only; geometry comes from the base (depth + lines dominant). Output stays in the base camera.
6. **Drift review.** Tri-view (base / render / result) + structural delta heatmap; "Repair with stronger lock" reruns with higher control weight.

### 7.3 Wireframes (reference)

**Main editor:**

```
┌─────────────────────────────────────────────┬──────────────────────────────┐
│                                               │ OBJECT INVENTORY     [⚙ scan]│
│           ROOM PHOTO                          │ ──────────────────────────── │
│      (hover = highlight + outline)            │ 🔒 Left wall        [Keep ▾] │
│                                               │ ✏️ Sofa  ← selected          │
│            ╭───────╮ ← selected mask          │   [Keep][Remove][Recolor]    │
│            │ SOFA  │                          │   [Swap][Restyle]            │
│            ╰───────╯                          │   └ "leather chesterfield"   │
│   mask: [ + add ] [ − remove ] [feather ▭]    │ 🔒 Rug · Floor · Lamp · Window│
│                                               │ ──────────────────────────── │
│                                               │ LOCK LIST (unchanged · 5)    │
│                                               │ wall·rug·floor·lamp·window   │
│                                               │ [ ▶ Apply to Sofa (1 edit) ] │
├───────────────────────────────────────────────┴──────────────────────────────┤
│ HISTORY: [●Recolor wall] [●Remove plant] [○Swap sofa*] ← current               │
└────────────────────────────────────────────────────────────────────────────┘
```

**Before/after review:**

```
┌───────────── Review: Sofa swap ──────────────┐
│  BEFORE ◀┃▶ AFTER (slider)   Variants: v1* v2 v3 │
│  [ Diff highlight ◑ ON ] outlines changed pixels │
│  ✓ Only the Sofa changed. 5 locks verified.      │
│  [ ✗ Discard ] [ ↻ Regenerate ] [ ✓ Accept v1 ]  │
└──────────────────────────────────────────────────┘
```

---

## 8. Data model

The product's source of truth is the `EditPlan`, not a canvas document.

```ts
type Intent =
  | "keep"        // unchanged (default for detected objects)
  | "lock"        // explicitly protected (default for structure)
  | "remove"
  | "recolor"
  | "swap"        // replace with a described/ referenced object
  | "restyle"
  | "use_reference";

type GlobalLock = "camera" | "room_geometry" | "layout" | "lighting";

type TokenKind = "object" | "surface" | "opening" | "room_shell";

type EditToken = {
  id: string;
  label: string;              // editable; "Sofa", "Left wall"
  kind: TokenKind;
  maskId: string;             // reference to stored mask (PNG / RLE)
  confidence: number;         // 0..1 from segmentation
  intent: Intent;
  instruction?: string;       // "forest green", "leather chesterfield"
  referenceTokenId?: string;  // for use_reference / cross-angle transfer
  preserve: Array<"shape" | "position" | "texture" | "edges">;
};

type Correspondence = {
  baseTokenId: string;
  referenceTokenId: string;
  anchors: Array<{ base: [number, number]; reference: [number, number] }>;
  confirmed: boolean;
};

type EditPlan = {
  id: string;
  baseImageId: string;
  referenceImageIds: string[];
  globalLocks: GlobalLock[];          // defaults: all four ON
  tokens: EditToken[];
  correspondences?: Correspondence[]; // Phase 3
  transferScope?: Array<"materials" | "colors" | "lighting" | "furniture_style" | "decor">;
};
```

Each generation run produces a `GenerationResult` (candidate images + per-token diff/verification metadata) linked to the `EditPlan` step.

---

## 9. Technical architecture

| Concern | Approach | Where it runs | Phase |
|---|---|---|---|
| Object/surface masks (interactive) | SAM2/SAM3 via **WebGPU** (transformers.js / ONNX Runtime Web) | Browser (free, private, instant) | 1 |
| Mask fallback / text-prompt select ("sofa") | `fal-ai/sam-3/image` or Replicate `grounded_sam` | Serverless route → hosted API | 1 (fallback), 2 |
| Surface labels (wall/floor/ceiling) | ADE20K panoptic seg | Hosted API or Python svc | 1–2 |
| Mask post-process | auto-expand 8–16px + feather 6–10px | Browser canvas / Worker | 1 |
| Intent parsing (NL → tokens) | `gpt-5.5` Responses API, structured JSON output | Serverless route | 2 |
| Scoped edit | **existing** `editScene()` → `gpt-image-2` `images.edit` via `/api/edit-scene` | Existing serverless path | 1 |
| Forced compositing | paste original pixels outside feathered mask | Browser canvas (or Worker) | 1 |
| Diff / lock verification | client-side pixel diff over non-mask region | Browser | 1 |
| Geometry conditioning | Depth Anything V2 + M-LSD line map | Hosted API / Python GPU svc | 3 |
| Hard geometry lock | ControlNet (depth+MLSD) on Flux (fal control endpoints / ComfyUI-as-a-service) | Hosted GPU | 3 |
| Stronger reference transfer | FLUX Kontext (~$0.04/img, ~4–6s) or Gemini multi-image | Hosted API | 3 |
| Room shell | ST-RoomNet (layout primitives) | Python GPU svc | 3 |

**Cost anchors (2026):** FLUX Kontext Pro ~$0.04/img; FLUX Fill Pro ~$0.05/output ~8s; fal FLUX control LoRA ~$0.04/MP; SAM-3D ~$0.005/gen. Browser WebGPU SAM = $0.

**New/changed surfaces:**
- New route `POST /api/segment` (Phase 1 fallback / Phase 2): image → tokens + masks (proxies hosted SAM).
- New route `POST /api/plan` (Phase 2): NL instruction + token list → structured `EditPlan` diff + clarifying questions.
- Extend `/api/edit-scene` to accept a single-token edit payload and return diff metadata; keep backward compatibility.
- New route `POST /api/render-locked` (Phase 3): plan + depth/line maps → ControlNet/Flux generation.
- Retire tldraw canvas components; replace with the Object Control Room editor.

---

## 10. Scope & effort by phase

**Effort key:** S = ~days, M = ~1–2 weeks, L = multi-week.

### Phase 1 — Object Control Room (target: ship in weeks)
| Item | Effort |
|---|---|
| Editor shell (replace tldraw with fixed image + right panel) | M |
| WebGPU SAM click-to-select + "segment everything" | M |
| Object Inventory + Lock list panel, hover-sync | M |
| Intent chips → structured `EditToken` | S |
| Mask auto-expand / feather | S |
| Wire intent → existing `/api/edit-scene` (one token at a time) | S |
| Forced overlay compositing | S |
| Before/after slider + variant filmstrip + diff-highlight | M |
| Linear, revertible edit history | S–M |
| Hosted SAM fallback (no-WebGPU devices) | S |

**Phase 1 exit criteria:** A user can upload a photo, click an object, recolor/remove/swap it, and the result changes *only* that object (verified by diff); locked objects are byte-identical.

### Phase 2 — Command Plan (natural-language intent)
| Item | Effort |
|---|---|
| `gpt-5.5` intent parser → `EditPlan` diff (`/api/plan`) | M |
| Command Plan review UI (Changing / Locked columns) | S–M |
| Targeted ambiguity questions w/ highlighted candidates | M |
| Text-promptable selection ("select all the chairs") via SAM3 | S–M |
| Voice input (optional) | S |

**Phase 2 exit criteria:** A user can type a multi-part instruction and get a correct, confirmable plan that maps to tokens + locks, with clarifying questions only where genuinely ambiguous.

### Phase 3 — Anchor Mode (hard lock + cross-angle)
| Item | Effort |
|---|---|
| Depth Anything V2 + M-LSD preprocessing pipeline | M |
| Structure-lock checklist UI (walls/windows/ceiling/floor/camera) | M |
| ControlNet (depth+MLSD) on Flux generation path (`/api/render-locked`) | L |
| Drift-review (edge/depth/SSIM delta + heatmap + repair) | M |
| Dual-pane correspondence (manual anchors, transfer scope) | M |
| Auto-suggested correspondences + confidence repair | M |

**Phase 3 exit criteria:** Geometry/camera are provably preserved (drift below threshold) even on aggressive restyles; the cross-angle flow transfers materials/colors onto the base camera with user-confirmed correspondence.

---

## 11. Future / research bets (post-Phase 3)
- **True 3D, multi-angle:** SAM-3D, Gaussian splat, EditSplat/GaussCtrl-style editing for genuine re-projection. Heavy GPU + research-grade; revisit when cross-angle demand is proven.
- **Lightweight scene graph:** z-order, depth bands, surface planes, object relationships as editable tokens (a step toward editable composition without full 3D).
- **Dedicated Python/GPU microservice** if hosted per-call CV/generation costs or latency become the bottleneck.

---

## 12. Success metrics
- **Scope fidelity:** % of generations where non-target pixels are unchanged within tolerance (target: >99% via compositing).
- **Geometry drift:** mean structural delta (edge/depth) between base and result on "keep structure" edits (Phase 3 target: below a defined threshold).
- **Edit acceptance rate:** % of generations accepted without regeneration (target trend ↑).
- **Time-to-first-accepted-edit** (target trend ↓).
- **Qualitative:** users report the result "kept what I wanted" (survey / thumbs).

---

## 13. Risks & mitigations
- **WebGPU coverage** uneven on older/mobile browsers → hosted SAM fallback in Phase 1 scope; perf budget.
- **In-mask drift:** `gpt-image-2` can still alter the *selected* object oddly even when outside is composited → auto-expand/feather + variant review in P1; ControlNet hard-lock in P3.
- **Segmentation quality** makes or breaks the UX → manual mask grow/shrink/feather + editable labels from day one.
- **Tight masks backfire** (model replaces instead of removes) → always expand/feather and preview the edit boundary.
- **Trust:** promising "locked" then drifting kills confidence → diff-verification + drift review are first-class, not afterthoughts.
- **Conversational UX hides complexity** → the Command Plan is always shown and editable before generation.
- **Hosted CV/gen cost & latency** at scale → cache masks/depth maps with the plan; consider Python/GPU service when volume justifies.
- **Cross-angle is not magic** → user-confirmed correspondence, materials/colors by default, layout/camera off.

---

## 14. Open questions
1. Hard cutover vs. keep the tldraw canvas behind a flag during Phase 1?
2. Primary entry in Phase 2: text-first or click-first (or adaptive per user)?
3. fal vs. Replicate vs. self-hosted for the Phase 3 ControlNet path — pricing/latency spike needed before committing.
4. Do we persist `EditPlan`s server-side (accounts) or keep everything local for now?
5. Commercial licensing review for SAM 3 weights + each hosted endpoint.
```
