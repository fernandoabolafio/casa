"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  EDITABLE_INTENTS,
  intentToInstruction,
  intentVerb,
  type HistoryStep,
  type Intent,
} from "@/lib/edit-plan";
import {
  compositeOutsideMask,
  dilate,
  feather,
  maskBounds,
  type MaskBuffer,
} from "@/lib/mask-ops-core";
import {
  coverResizeToDataUrl,
  diffOverlayDataUrl,
  getRGBA,
  maskToOpenAIPngBlob,
  maskToOverlayDataUrl,
  pickEditSize,
  rectMask,
  rgbaToDataUrl,
} from "@/lib/mask-ops";
import { createSegmenter, preloadSegmenter, type Segmenter } from "@/lib/segmenter";
import type { ApiSceneResponse } from "@/lib/types";
import type { EditSize } from "@/lib/openai-images";

type Working = {
  dataUrl: string;
  width: number;
  height: number;
  size: EditSize;
};

type Tool = "point" | "box";
type Quality = "low" | "medium" | "high";
type SelectorState = "idle" | "loading" | "ready" | "error";

const INTENT_HINTS: Record<Exclude<Intent, "keep">, string> = {
  remove: "",
  recolor: "e.g. deep olive green",
  swap: "e.g. a tan leather chesterfield",
  restyle: "e.g. mid-century walnut",
};

function readSceneResponse(payload: ApiSceneResponse & { error?: string }, ok: boolean) {
  if (!ok) throw new Error(payload.error ?? "The edit request failed.");
  return payload;
}

export function ObjectControlRoom() {
  const [working, setWorking] = useState<Working | null>(null);
  const [tool, setTool] = useState<Tool>("point");
  const [quality, setQuality] = useState<Quality>("low");
  const [selectorState, setSelectorState] = useState<SelectorState>("idle");
  const [pendingMask, setPendingMask] = useState<MaskBuffer | null>(null);
  const [intent, setIntent] = useState<Exclude<Intent, "keep">>("recolor");
  const [instruction, setInstruction] = useState("");
  const [isSelecting, setIsSelecting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryStep[]>([]);
  const [review, setReview] = useState<HistoryStep | null>(null);
  const [sliderPct, setSliderPct] = useState(50);

  const segmenterRef = useRef<Segmenter | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const boxStartRef = useRef<{
    normX: number;
    normY: number;
    px: number;
    py: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSelectorState("loading");
    preloadSegmenter()
      .then(() => {
        if (!cancelled) setSelectorState("ready");
      })
      .catch(() => {
        if (!cancelled) setSelectorState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const overlayUrl = useMemo(
    () => (pendingMask ? maskToOverlayDataUrl(pendingMask, [217, 164, 65]) : null),
    [pendingMask],
  );

  const loadFile = useCallback(async (file: File) => {
    setError(null);
    try {
      const rawUrl = await fileToDataUrl(file);
      const { width: natW, height: natH } = await imageSize(rawUrl);
      const target = pickEditSize(natW, natH);
      const dataUrl = await coverResizeToDataUrl(rawUrl, target.width, target.height);
      const next: Working = {
        dataUrl,
        width: target.width,
        height: target.height,
        size: target.size,
      };
      setWorking(next);
      setHistory([]);
      setReview(null);
      setPendingMask(null);

      const segmenter = createSegmenter();
      segmenterRef.current = segmenter;
      segmenter.prepare(dataUrl).catch(() => {
        setSelectorState("error");
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the image.");
    }
  }, []);

  const stageToWorking = useCallback(
    (clientX: number, clientY: number) => {
      const stage = stageRef.current;
      if (!stage || !working) return null;
      const rect = stage.getBoundingClientRect();
      const normX = (clientX - rect.left) / rect.width;
      const normY = (clientY - rect.top) / rect.height;
      if (normX < 0 || normX > 1 || normY < 0 || normY > 1) return null;
      return {
        normX,
        normY,
        px: Math.round(normX * working.width),
        py: Math.round(normY * working.height),
      };
    },
    [working],
  );

  const handlePointSelect = useCallback(
    async (clientX: number, clientY: number) => {
      const point = stageToWorking(clientX, clientY);
      const segmenter = segmenterRef.current;
      if (!point || !segmenter || selectorState !== "ready") return;
      setIsSelecting(true);
      setError(null);
      try {
        const mask = await segmenter.segmentAtPoint(point.normX, point.normY);
        if (!maskBounds(mask)) {
          setError("No object detected there. Try clicking the center of an object.");
          return;
        }
        setPendingMask(mask);
      } catch {
        setError("Selection failed. Try the box tool instead.");
      } finally {
        setIsSelecting(false);
      }
    },
    [selectorState, stageToWorking],
  );

  const handleStagePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (!working || isGenerating) return;
      if (tool === "point") {
        void handlePointSelect(event.clientX, event.clientY);
        return;
      }
      const point = stageToWorking(event.clientX, event.clientY);
      if (point) boxStartRef.current = point;
    },
    [handlePointSelect, isGenerating, stageToWorking, tool, working],
  );

  const handleStagePointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (tool !== "box" || !working) return;
      const start = boxStartRef.current;
      const end = stageToWorking(event.clientX, event.clientY);
      boxStartRef.current = null;
      if (!start || !end) return;
      const mask = rectMask(working.width, working.height, start.px, start.py, end.px, end.py);
      if (maskBounds(mask)) setPendingMask(mask);
    },
    [stageToWorking, tool, working],
  );

  const applyEdit = useCallback(async () => {
    if (!working || !pendingMask) return;
    setIsGenerating(true);
    setError(null);
    try {
      const apiMask = dilate(pendingMask, 8);
      const blendMask = feather(apiMask, 4);
      const maskBlob = await maskToOpenAIPngBlob(apiMask);
      const originalRGBA = await getRGBA(working.dataUrl, working.width, working.height);

      const formData = new FormData();
      formData.append("scene", working.dataUrl);
      formData.append("mask", maskBlob, "mask.png");
      formData.append("instruction", intentToInstruction(intent, instruction));
      formData.append("quality", quality);
      formData.append("size", working.size);

      const response = await fetch("/api/edit-object", { method: "POST", body: formData });
      const payload = readSceneResponse(
        (await response.json()) as ApiSceneResponse & { error?: string },
        response.ok,
      );

      const editedRGBA = await getRGBA(payload.image, working.width, working.height);
      const compositedRGBA = compositeOutsideMask(originalRGBA, editedRGBA, blendMask);
      const composited = rgbaToDataUrl(compositedRGBA, working.width, working.height);
      const diff = diffOverlayDataUrl(
        originalRGBA,
        compositedRGBA,
        working.width,
        working.height,
      );

      const step: HistoryStep = {
        id: `${Date.now()}`,
        tokenLabel: describeMask(pendingMask),
        intent,
        instruction: instruction.trim(),
        before: working.dataUrl,
        after: composited,
        diffOverlay: diff.overlayUrl,
        changedPct: diff.changedPct,
      };
      setHistory((prev) => [...prev, step]);
      setReview(step);
      setSliderPct(50);
      setWorking({ ...working, dataUrl: composited });
      setPendingMask(null);
      setInstruction("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The edit failed.");
    } finally {
      setIsGenerating(false);
    }
  }, [instruction, intent, pendingMask, quality, working]);

  const undoLast = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setWorking((current) => (current ? { ...current, dataUrl: last.before } : current));
      setReview(null);
      return prev.slice(0, -1);
    });
  }, []);

  if (!working) {
    return (
      <UploadScreen onFile={loadFile} error={error} selectorState={selectorState} />
    );
  }

  return (
    <div className="ocr">
      <div className="ocr__stage-wrap">
        <header className="ocr__topbar">
          <strong className="ocr__brand">Casa · Object Control Room</strong>
          <div className="ocr__tools">
            <ToolButton active={tool === "point"} onClick={() => setTool("point")}>
              Click-to-select
            </ToolButton>
            <ToolButton active={tool === "box"} onClick={() => setTool("box")}>
              Box
            </ToolButton>
            <button className="ocr__btn" type="button" onClick={undoLast} disabled={history.length === 0}>
              Undo
            </button>
            <button
              className="ocr__btn"
              type="button"
              onClick={() => {
                setWorking(null);
                setHistory([]);
              }}
            >
              New photo
            </button>
          </div>
        </header>

        <div
          ref={stageRef}
          className={`ocr__stage ocr__stage--${tool}`}
          onPointerDown={handleStagePointerDown}
          onPointerUp={handleStagePointerUp}
        >
          { }
          <img className="ocr__image" src={working.dataUrl} alt="Room being edited" draggable={false} />
          {overlayUrl ? (
             
            <img className="ocr__overlay" src={overlayUrl} alt="" draggable={false} />
          ) : null}
          {(isSelecting || isGenerating) ? (
            <div className="ocr__busy">
              <div className="ocr__spinner" />
              <span>{isGenerating ? "Applying edit…" : "Detecting object…"}</span>
            </div>
          ) : null}
        </div>

        {review ? (
          <BeforeAfter step={review} pct={sliderPct} onPct={setSliderPct} onClose={() => setReview(null)} />
        ) : null}
      </div>

      <aside className="ocr__panel">
        <section className="ocr__section">
          <h2 className="ocr__h2">Selection</h2>
          {pendingMask ? (
            <p className="ocr__hint">{describeMask(pendingMask)} selected.</p>
          ) : (
            <p className="ocr__hint">
              {tool === "point"
                ? selectorState === "ready"
                  ? "Click an object in the photo to select it."
                  : selectorState === "loading"
                    ? "Loading the selection model…"
                    : "Selector unavailable. Use the Box tool."
                : "Drag a box around an object to select it."}
            </p>
          )}

          <div className="ocr__chips">
            {EDITABLE_INTENTS.map((option) => (
              <button
                key={option}
                type="button"
                className={`ocr__chip ${intent === option ? "ocr__chip--on" : ""}`}
                onClick={() => setIntent(option)}
              >
                {intentVerb(option)}
              </button>
            ))}
          </div>

          {intent !== "remove" ? (
            <input
              className="ocr__input"
              value={instruction}
              placeholder={INTENT_HINTS[intent]}
              onChange={(event) => setInstruction(event.target.value)}
            />
          ) : null}

          <div className="ocr__quality">
            <span>Quality</span>
            {(["low", "medium", "high"] as Quality[]).map((q) => (
              <button
                key={q}
                type="button"
                className={`ocr__chip ocr__chip--sm ${quality === q ? "ocr__chip--on" : ""}`}
                onClick={() => setQuality(q)}
              >
                {q}
              </button>
            ))}
          </div>

          <button
            className="ocr__apply"
            type="button"
            disabled={!pendingMask || isGenerating}
            onClick={applyEdit}
          >
            {isGenerating ? "Applying…" : `Apply: ${intentVerb(intent)} this object`}
          </button>
          {error ? <p className="ocr__error">{error}</p> : null}
        </section>

        <section className="ocr__section">
          <h2 className="ocr__h2">Locked</h2>
          <p className="ocr__lock">
            Everything you have not edited stays byte-identical. Each edit changes only its
            selected region.
          </p>
        </section>

        <section className="ocr__section ocr__section--grow">
          <h2 className="ocr__h2">Edits ({history.length})</h2>
          {history.length === 0 ? (
            <p className="ocr__hint">No edits yet.</p>
          ) : (
            <ol className="ocr__history">
              {history.map((step) => (
                <li key={step.id}>
                  <button type="button" className="ocr__history-item" onClick={() => setReview(step)}>
                    <strong>{intentVerb(step.intent)}</strong> {step.tokenLabel}
                    {step.instruction ? ` — ${step.instruction}` : ""}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </div>
  );
}

function describeMask(mask: MaskBuffer): string {
  const bounds = maskBounds(mask);
  if (!bounds) return "Region";
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  const area = (w * h) / (mask.width * mask.height);
  if (area > 0.45) return "Large region";
  if (area > 0.12) return "Object";
  return "Small object";
}

function ToolButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`ocr__btn ${active ? "ocr__btn--on" : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function BeforeAfter({
  step,
  pct,
  onPct,
  onClose,
}: {
  step: HistoryStep;
  pct: number;
  onPct: (value: number) => void;
  onClose: () => void;
}) {
  const [showDiff, setShowDiff] = useState(false);

  return (
    <div className="ocr__review">
      <div className="ocr__review-head">
        <span>
          Before / after — {intentVerb(step.intent)} {step.tokenLabel}
        </span>
        <div className="ocr__review-actions">
          <button
            type="button"
            className={`ocr__btn ${showDiff ? "ocr__btn--on" : ""}`}
            onClick={() => setShowDiff((value) => !value)}
          >
            {showDiff ? "Hide changes" : "Highlight changes"}
          </button>
          <button className="ocr__btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <div className="ocr__compare">
        <img className="ocr__compare-img" src={step.after} alt="After" draggable={false} />
        <img
          className="ocr__compare-img ocr__compare-before"
          src={step.before}
          alt="Before"
          draggable={false}
          style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
        />
        {showDiff ? (
          <img className="ocr__compare-diff" src={step.diffOverlay} alt="" draggable={false} />
        ) : null}
        <div className="ocr__compare-divider" style={{ left: `${pct}%` }} />
      </div>
      <input
        className="ocr__slider"
        type="range"
        min={0}
        max={100}
        value={pct}
        onChange={(event) => onPct(Number(event.target.value))}
      />
      <p className="ocr__trust">
        Only {step.changedPct.toFixed(1)}% of the image changed — everything outside your
        selection is byte-identical to the original.
      </p>
    </div>
  );
}

function UploadScreen({
  onFile,
  error,
  selectorState,
}: {
  onFile: (file: File) => void;
  error: string | null;
  selectorState: SelectorState;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className="ocr-upload">
      <div
        className={`ocr-upload__well ${dragging ? "ocr-upload__well--drag" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
      >
        <h1 className="ocr-upload__title">Drop a room photo</h1>
        <p className="ocr-upload__sub">
          Then point at objects to change them. Everything you do not touch stays exactly as it is.
        </p>
        <button className="ocr__apply" type="button">
          Choose photo
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
          }}
        />
        <p className="ocr-upload__status">
          {selectorState === "loading"
            ? "Loading the in-browser selection model…"
            : selectorState === "error"
              ? "Selection model unavailable — the box tool will still work."
              : "In-browser object selection ready."}
        </p>
        {error ? <p className="ocr__error">{error}</p> : null}
      </div>
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Could not read image dimensions."));
    image.src = dataUrl;
  });
}
