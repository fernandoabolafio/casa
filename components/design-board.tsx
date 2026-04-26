"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AssetRecordType,
  Tldraw,
  createShapeId,
  type Editor,
  type TLAssetId,
  type TLComponents,
  type TLImageShape,
  type TLShape,
  type TLShapeId,
  type TLTextShape,
  type VecLike,
  useEditor,
  useValue,
} from "tldraw";
import {
  GENERATION_PLACEHOLDER_TYPE,
  GenerationPlaceholderShapeUtil,
  type GenerationPlaceholderShape,
} from "@/components/generation-placeholder-shape";
import type { ApiSceneResponse, ImageProvider } from "@/lib/types";

const PROVIDER_STORAGE_KEY = "casa.imageProvider";

const PROVIDER_LABELS: Record<ImageProvider, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
};

const PLACEHOLDER_W = 480;
const PLACEHOLDER_H = 320;
const PLACEHOLDER_OFFSET_STEP = 36;

const customShapeUtils = [GenerationPlaceholderShapeUtil];

type AddImageOptions = {
  point?: VecLike;
  select?: boolean;
  autoAssignBase?: boolean;
};

export type DesignBoardHandle = {
  addFiles: (files: File[], options?: AddImageOptions) => Promise<void>;
};

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

async function getImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({
        width: image.naturalWidth || 1024,
        height: image.naturalHeight || 768,
      });
    image.onerror = () => reject(new Error("Could not load image dimensions."));
    image.src = src;
  });
}

function fitImageSize(width: number, height: number, maxSide = 520) {
  const scale = Math.min(1, maxSide / Math.max(width, height));

  return {
    width: Math.max(80, Math.round(width * scale)),
    height: Math.max(80, Math.round(height * scale)),
  };
}

function isImageShape(shape: TLShape | undefined | null): shape is TLImageShape {
  return Boolean(shape && shape.type === "image");
}

function isTextShape(shape: TLShape): shape is TLTextShape {
  return shape.type === "text";
}

function isPlaceholderShape(
  shape: TLShape | undefined | null,
): shape is GenerationPlaceholderShape {
  return Boolean(shape && shape.type === GENERATION_PLACEHOLDER_TYPE);
}

type ImageRole = "base" | "reference";

function getRole(shape: TLShape): ImageRole | undefined {
  const role = (shape.meta as { role?: string } | undefined)?.role;
  return role === "base" || role === "reference" ? role : undefined;
}

function findImagesByRole(editor: Editor, role: ImageRole): TLImageShape[] {
  return editor
    .getCurrentPageShapes()
    .filter(isImageShape)
    .filter((shape) => getRole(shape) === role);
}

function getSelectedImages(editor: Editor): TLImageShape[] {
  return editor.getSelectedShapes().filter(isImageShape);
}

type SelectionRoleState = "none" | "all" | "none-of" | "mixed";

function describeSelectionRoleState(
  images: TLImageShape[],
  role: ImageRole,
): SelectionRoleState {
  if (images.length === 0) return "none";
  const matching = images.filter((s) => getRole(s) === role).length;
  if (matching === 0) return "none-of";
  if (matching === images.length) return "all";
  return "mixed";
}

/**
 * Toggle a role on the given image shapes.
 * - If every shape is already at this role, all are unmarked.
 * - Otherwise, every shape is set to this role (overriding any previous role).
 * Multiple bases / references can coexist (one base per generation cluster,
 * any number of design references).
 */
function toggleRole(editor: Editor, ids: TLShapeId[], role: ImageRole) {
  const shapes = ids
    .map((id) => editor.getShape(id))
    .filter((shape): shape is TLImageShape => isImageShape(shape));

  if (shapes.length === 0) return;

  const allAtRole = shapes.every((shape) => getRole(shape) === role);
  const target: ImageRole | "" = allAtRole ? "" : role;

  const updates = shapes.map((shape) => ({
    id: shape.id,
    type: "image" as const,
    meta: { role: target },
  }));

  editor.updateShapes(updates);
}

function richTextToPlainText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const record = node as { text?: unknown; content?: unknown };

  if (typeof record.text === "string") {
    return record.text;
  }

  if (Array.isArray(record.content)) {
    return record.content.map(richTextToPlainText).join(" ");
  }

  return "";
}

type CollectedInput = {
  composite: Blob;
  textHints: string[];
};

type GenerationCollection = {
  base: CollectedInput;
  references: CollectedInput[];
  inspirations: CollectedInput[];
  baseShape: TLImageShape;
};

const MAX_UPLOAD_LONG_EDGE = 1024;

async function flattenImageWithAnnotations(
  editor: Editor,
  imageShape: TLImageShape,
  allShapes: TLShape[],
): Promise<CollectedInput | null> {
  const imageBounds = editor.getShapePageBounds(imageShape);
  if (!imageBounds) return null;

  const overlapping = allShapes.filter((shape) => {
    if (shape.id === imageShape.id) return false;
    if (isImageShape(shape)) return false;
    if (isPlaceholderShape(shape)) return false;

    const bounds = editor.getShapePageBounds(shape);
    return bounds ? bounds.collides(imageBounds) : false;
  });

  const longEdge = Math.max(imageBounds.width, imageBounds.height);
  const scale = longEdge > 0 ? Math.min(1, MAX_UPLOAD_LONG_EDGE / longEdge) : 1;

  const ids = [imageShape.id, ...overlapping.map((shape) => shape.id)];
  const result = await editor.toImage(ids, {
    format: "png",
    background: false,
    padding: 0,
    bounds: imageBounds,
    scale,
  });

  const textHints = overlapping
    .filter(isTextShape)
    .map((shape) => richTextToPlainText(shape.props.richText).trim())
    .filter((text): text is string => Boolean(text));

  return { composite: result.blob, textHints };
}

type ClusterPickError =
  | { kind: "no-base" }
  | { kind: "many-bases"; count: number };

function pickClusterFromSelection(
  editor: Editor,
):
  | {
      ok: true;
      baseShape: TLImageShape;
      referenceShapes: TLImageShape[];
      inspirationShapes: TLImageShape[];
    }
  | { ok: false; error: ClusterPickError } {
  const selected = getSelectedImages(editor);
  const bases = selected.filter((shape) => getRole(shape) === "base");

  if (bases.length === 0) {
    return { ok: false, error: { kind: "no-base" } };
  }
  if (bases.length > 1) {
    return { ok: false, error: { kind: "many-bases", count: bases.length } };
  }

  const baseShape = bases[0];
  const remaining = selected.filter((shape) => shape.id !== baseShape.id);
  const referenceShapes = remaining.filter(
    (shape) => getRole(shape) === "reference",
  );
  const inspirationShapes = remaining.filter(
    (shape) => getRole(shape) !== "reference",
  );
  return { ok: true, baseShape, referenceShapes, inspirationShapes };
}

async function collectGenerationInputs(
  editor: Editor,
  baseShape: TLImageShape,
  referenceShapes: TLImageShape[],
  inspirationShapes: TLImageShape[],
): Promise<GenerationCollection | null> {
  const allShapes = editor.getCurrentPageShapes();
  const base = await flattenImageWithAnnotations(editor, baseShape, allShapes);
  if (!base) return null;

  const references: CollectedInput[] = [];
  for (const shape of referenceShapes) {
    const collected = await flattenImageWithAnnotations(editor, shape, allShapes);
    if (collected) references.push(collected);
  }

  const inspirations: CollectedInput[] = [];
  for (const shape of inspirationShapes) {
    const collected = await flattenImageWithAnnotations(editor, shape, allShapes);
    if (collected) inspirations.push(collected);
  }

  return { base, references, inspirations, baseShape };
}

async function readSceneResponse(response: Response): Promise<ApiSceneResponse> {
  const payload = (await response.json()) as ApiSceneResponse & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "The image request failed.");
  }

  return payload;
}

function computePlaceholderPoint(
  editor: Editor,
  baseShape: TLImageShape | null,
  fanIndex: number,
): VecLike {
  const baseBounds = baseShape ? editor.getShapePageBounds(baseShape) : null;

  if (baseBounds) {
    return {
      x: baseBounds.maxX + 48,
      y: baseBounds.minY + fanIndex * PLACEHOLDER_OFFSET_STEP,
    };
  }

  const viewport = editor.getViewportPageBounds();
  return {
    x: viewport.center.x - PLACEHOLDER_W / 2 + fanIndex * PLACEHOLDER_OFFSET_STEP,
    y: viewport.center.y - PLACEHOLDER_H / 2 + fanIndex * PLACEHOLDER_OFFSET_STEP,
  };
}

function countPlaceholdersNear(editor: Editor, baseShape: TLImageShape): number {
  const bounds = editor.getShapePageBounds(baseShape);
  if (!bounds) return 0;
  const probe = {
    minX: bounds.maxX,
    minY: bounds.minY - 200,
    maxX: bounds.maxX + 1000,
    maxY: bounds.maxY + 200,
  };
  return editor
    .getCurrentPageShapes()
    .filter(isPlaceholderShape)
    .filter((shape) => {
      const b = editor.getShapePageBounds(shape);
      if (!b) return false;
      return (
        b.minX < probe.maxX &&
        b.maxX > probe.minX &&
        b.minY < probe.maxY &&
        b.maxY > probe.minY
      );
    }).length;
}

type DesignBoardProps = {
  onError?: (message: string | null) => void;
};

export const DesignBoard = forwardRef<DesignBoardHandle, DesignBoardProps>(
  function DesignBoard({ onError }, ref) {
    const editorRef = useRef<Editor | null>(null);
    const jobsRef = useRef<Map<TLShapeId, AbortController>>(new Map());
    const directionRef = useRef("");
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [provider, setProviderState] = useState<ImageProvider>("openai");

    const setProvider = useCallback((next: ImageProvider) => {
      setProviderState(next);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(PROVIDER_STORAGE_KEY, next);
        } catch {
          // ignore storage errors
        }
      }
    }, []);

    useEffect(() => {
      try {
        const stored = window.localStorage.getItem(PROVIDER_STORAGE_KEY);
        if (stored === "openai" || stored === "gemini") {
          setProviderState(stored);
        }
      } catch {
        // ignore
      }
    }, []);

    useEffect(() => {
      const jobs = jobsRef.current;
      return () => {
        jobs.forEach((controller) => controller.abort());
        jobs.clear();
      };
    }, []);

    const reportError = useCallback(
      (message: string | null) => {
        setErrorMessage(message);
        onError?.(message);
      },
      [onError],
    );

    const addImageDataUrls = useCallback(
      async (
        items: Array<{ dataUrl: string; name: string }>,
        options?: AddImageOptions & { replacePlaceholderId?: TLShapeId },
      ) => {
        const editor = editorRef.current;

        if (!editor) {
          throw new Error("Canvas is not ready yet.");
        }

        const placeholderId = options?.replacePlaceholderId;
        const placeholder = placeholderId
          ? editor.getShape(placeholderId)
          : null;
        const placeholderBounds =
          placeholder && isPlaceholderShape(placeholder)
            ? editor.getShapePageBounds(placeholder)
            : null;

        const basePoint =
          placeholderBounds
            ? { x: placeholderBounds.minX, y: placeholderBounds.minY }
            : options?.point ??
              editor.getSelectionPageBounds()?.center ??
              editor.getViewportPageBounds().center;
        const createdIds: TLImageShape["id"][] = [];

        for (const [index, item] of items.entries()) {
          const naturalSize = await getImageSize(item.dataUrl);
          const size = fitImageSize(naturalSize.width, naturalSize.height);
          const id = createShapeId() as TLImageShape["id"];
          const offset = placeholderBounds ? 0 : index * 32;
          const assetId: TLAssetId = AssetRecordType.createId();

          editor.createAssets([
            {
              id: assetId,
              type: "image",
              typeName: "asset",
              meta: {},
              props: {
                name: item.name,
                src: item.dataUrl,
                w: naturalSize.width,
                h: naturalSize.height,
                mimeType: "image/png",
                isAnimated: false,
              },
            },
          ]);

          const x = placeholderBounds
            ? placeholderBounds.minX +
              (placeholderBounds.width - size.width) / 2
            : basePoint.x + offset - size.width / 2;
          const y = placeholderBounds
            ? placeholderBounds.minY +
              (placeholderBounds.height - size.height) / 2
            : basePoint.y + offset - size.height / 2;

          editor.run(() => {
            if (placeholderId && index === 0) {
              editor.deleteShape(placeholderId);
            }
            editor.createShape<TLImageShape>({
              id,
              type: "image",
              x,
              y,
              props: {
                w: size.width,
                h: size.height,
                playing: true,
                url: "",
                assetId,
                crop: null,
                flipX: false,
                flipY: false,
                altText: item.name,
              },
            });
          });
          createdIds.push(id);
        }

        if (options?.select !== false && createdIds.length > 0) {
          editor.setSelectedShapes(createdIds);
        }

        if (
          options?.autoAssignBase &&
          createdIds.length > 0 &&
          findImagesByRole(editor, "base").length === 0
        ) {
          toggleRole(editor, [createdIds[0]], "base");
        }
      },
      [],
    );

    const addFiles = useCallback(
      async (files: File[], options?: AddImageOptions) => {
        const imageFiles = files.filter((file) => file.type.startsWith("image/"));

        if (imageFiles.length === 0) {
          reportError("Drop or choose image files only.");
          return;
        }

        const items = await Promise.all(
          imageFiles.map(async (file) => ({
            dataUrl: await fileToDataUrl(file),
            name: file.name,
          })),
        );

        await addImageDataUrls(items, { autoAssignBase: true, ...options });
      },
      [addImageDataUrls, reportError],
    );

    const enqueueGeneration = useCallback(async () => {
      const editor = editorRef.current;

      if (!editor) {
        reportError("Canvas is not ready yet.");
        return;
      }

      reportError(null);

      const pick = pickClusterFromSelection(editor);
      if (!pick.ok) {
        if (pick.error.kind === "no-base") {
          reportError(
            "Select a base image (and any inspirations) before generating. Use 'Toggle base' to mark one.",
          );
        } else {
          reportError(
            `Select exactly one base for this generation — ${pick.error.count} bases are currently selected.`,
          );
        }
        return;
      }

      let collection: GenerationCollection | null;
      try {
        collection = await collectGenerationInputs(
          editor,
          pick.baseShape,
          pick.referenceShapes,
          pick.inspirationShapes,
        );
      } catch (caught) {
        reportError(
          caught instanceof Error
            ? caught.message
            : "Could not prepare the selected images.",
        );
        return;
      }

      if (!collection) {
        reportError("Could not read the base image.");
        return;
      }

      const trimmedDirection = directionRef.current.trim();
      const placeholderId = createShapeId() as TLShapeId;
      const point = computePlaceholderPoint(
        editor,
        pick.baseShape,
        countPlaceholdersNear(editor, pick.baseShape),
      );

      editor.createShape<GenerationPlaceholderShape>({
        id: placeholderId,
        type: GENERATION_PLACEHOLDER_TYPE,
        x: point.x,
        y: point.y,
        props: {
          w: PLACEHOLDER_W,
          h: PLACEHOLDER_H,
          state: "running",
          label: `Generating with ${PROVIDER_LABELS[provider]}…`,
          error: "",
        },
      });

      const formData = new FormData();
      formData.append("provider", provider);
      if (trimmedDirection) {
        formData.append("direction", trimmedDirection);
      }
      formData.append("baseImage", collection.base.composite, "base.png");
      collection.base.textHints.forEach((hint) => {
        formData.append("baseHints", hint);
      });
      collection.references.forEach((input, index) => {
        formData.append(
          "referenceImages",
          input.composite,
          `reference-${index}.png`,
        );
        formData.append("referenceHints", JSON.stringify(input.textHints));
      });
      collection.inspirations.forEach((input, index) => {
        formData.append(
          "inspirationImages",
          input.composite,
          `inspiration-${index}.png`,
        );
        formData.append("inspirationHints", JSON.stringify(input.textHints));
      });

      const controller = new AbortController();
      jobsRef.current.set(placeholderId, controller);

      try {
        const response = await fetch("/api/generate-scene", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
        const payload = await readSceneResponse(response);

        if (controller.signal.aborted) return;

        const stillThere = editor.getShape(placeholderId);
        if (!stillThere) {
          await addImageDataUrls(
            [{ dataUrl: payload.image, name: "Generated interior scene" }],
            { select: false, autoAssignBase: false },
          );
          return;
        }

        await addImageDataUrls(
          [{ dataUrl: payload.image, name: "Generated interior scene" }],
          { select: true, autoAssignBase: false, replacePlaceholderId: placeholderId },
        );
      } catch (caught) {
        if (controller.signal.aborted) return;

        const message =
          caught instanceof Error ? caught.message : "Generation failed.";

        const stillThere = editor.getShape(placeholderId);
        if (stillThere && isPlaceholderShape(stillThere)) {
          editor.updateShape<GenerationPlaceholderShape>({
            id: placeholderId,
            type: GENERATION_PLACEHOLDER_TYPE,
            props: {
              ...stillThere.props,
              state: "error",
              label: "Generation failed",
              error: message,
            },
          });
        }
        reportError(message);
      } finally {
        jobsRef.current.delete(placeholderId);
      }
    }, [addImageDataUrls, provider, reportError]);

    useImperativeHandle(ref, () => ({ addFiles }), [addFiles]);

    const handleMount = useCallback((editor: Editor) => {
      editorRef.current = editor;

      const orphanPlaceholders = editor
        .getCurrentPageShapes()
        .filter(isPlaceholderShape)
        .filter((shape) => shape.props.state !== "error")
        .map((shape) => shape.id);

      if (orphanPlaceholders.length > 0) {
        editor.deleteShapes(orphanPlaceholders);
      }

      return () => {
        editorRef.current = null;
      };
    }, []);

    const components: TLComponents = useMemo(
      () => ({
        InFrontOfTheCanvas: () => <RoleBadges />,
        SharePanel: () => (
          <GenerateSharePanel
            errorMessage={errorMessage}
            provider={provider}
            onProviderChange={setProvider}
            directionRef={directionRef}
            onGenerate={enqueueGeneration}
          />
        ),
      }),
      [enqueueGeneration, errorMessage, provider, setProvider],
    );

    return (
      <section
        className={`board-shell ${isDraggingOver ? "dragging" : ""}`}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) {
            setIsDraggingOver(false);
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDraggingOver(true);
        }}
        onDrop={async (event) => {
          event.preventDefault();
          setIsDraggingOver(false);

          try {
            const editor = editorRef.current;
            const point = editor?.screenToPage({
              x: event.clientX,
              y: event.clientY,
            });
            await addFiles(Array.from(event.dataTransfer.files), { point });
          } catch (caught) {
            reportError(
              caught instanceof Error ? caught.message : "Could not add images.",
            );
          }
        }}
      >
        <Tldraw
          autoFocus
          persistenceKey="casa-design-board"
          shapeUtils={customShapeUtils}
          components={components}
          onMount={handleMount}
        />
        {isDraggingOver ? (
          <div className="drop-indicator">
            <span>Drop images onto the board</span>
          </div>
        ) : null}
      </section>
    );
  },
);

function RoleBadges() {
  const editor = useEditor();
  const placements = useValue(
    "role badge placements",
    () => {
      const all: Array<{ id: TLShapeId; role: ImageRole; x: number; y: number }> = [];
      for (const role of ["base", "reference"] as const) {
        for (const shape of findImagesByRole(editor, role)) {
          const bounds = editor.getShapePageBounds(shape);
          if (!bounds) continue;
          const topLeft = editor.pageToViewport({ x: bounds.x, y: bounds.y });
          all.push({ id: shape.id, role, x: topLeft.x, y: topLeft.y });
        }
      }
      return all;
    },
    [editor],
  );

  if (placements.length === 0) return null;

  return (
    <>
      {placements.map((placement) => (
        <div
          key={`${placement.role}-${placement.id}`}
          className={`role-badge role-badge--${placement.role}`}
          style={{
            transform: `translate(${placement.x}px, ${placement.y}px)`,
          }}
        >
          {placement.role === "base" ? "Base" : "Ref"}
        </div>
      ))}
    </>
  );
}

function GenerateSharePanel({
  errorMessage,
  provider,
  onProviderChange,
  directionRef,
  onGenerate,
}: {
  errorMessage: string | null;
  provider: ImageProvider;
  onProviderChange: (next: ImageProvider) => void;
  directionRef: React.MutableRefObject<string>;
  onGenerate: () => void;
}) {
  const editor = useEditor();
  const [direction, setDirection] = useState(directionRef.current);

  const handleDirectionChange = useCallback(
    (next: string) => {
      directionRef.current = next;
      setDirection(next);
    },
    [directionRef],
  );

  const summary = useValue(
    "generation summary",
    () => {
      const selectedImages = getSelectedImages(editor);
      const selectedIds = selectedImages.map((s) => s.id);
      const baseSelectionState = describeSelectionRoleState(selectedImages, "base");
      const referenceSelectionState = describeSelectionRoleState(
        selectedImages,
        "reference",
      );
      const selectedBaseCount = selectedImages.filter(
        (s) => getRole(s) === "base",
      ).length;
      const selectedReferenceCount = selectedImages.filter(
        (s) => getRole(s) === "reference",
      ).length;
      const inspirationCount =
        selectedImages.length - selectedBaseCount - selectedReferenceCount;
      const totalBaseCount = findImagesByRole(editor, "base").length;
      const totalReferenceCount = findImagesByRole(editor, "reference").length;
      const runningCount = editor
        .getCurrentPageShapes()
        .filter(isPlaceholderShape)
        .filter((shape) => shape.props.state === "running").length;

      return {
        selectedImageCount: selectedImages.length,
        selectedIds,
        baseSelectionState,
        referenceSelectionState,
        selectedBaseCount,
        selectedReferenceCount,
        inspirationCount,
        totalBaseCount,
        totalReferenceCount,
        runningCount,
      };
    },
    [editor],
  );

  const hasOneBaseInSelection = summary.selectedBaseCount === 1;
  const canGenerate = hasOneBaseInSelection;
  const note = errorMessage;

  const baseToggleLabel =
    summary.baseSelectionState === "all"
      ? "Unmark base"
      : summary.baseSelectionState === "none-of"
        ? "Mark as base"
        : "Toggle base";

  const referenceToggleLabel =
    summary.referenceSelectionState === "all"
      ? "Unmark reference"
      : summary.referenceSelectionState === "none-of"
        ? "Mark as reference"
        : "Toggle reference";

  const isExtend = summary.selectedReferenceCount > 0;

  let label: string;
  if (summary.selectedImageCount === 0) {
    label = "Select a base (+ refs / inspirations)";
  } else if (summary.selectedBaseCount === 0) {
    label = "Mark one selected image as base";
  } else if (summary.selectedBaseCount > 1) {
    label = `Select only one base (${summary.selectedBaseCount} chosen)`;
  } else if (isExtend) {
    const refs = `${summary.selectedReferenceCount} reference${
      summary.selectedReferenceCount === 1 ? "" : "s"
    }`;
    label =
      summary.inspirationCount === 0
        ? `Extend from ${refs}`
        : `Extend from ${refs} + ${summary.inspirationCount} inspiration${
            summary.inspirationCount === 1 ? "" : "s"
          }`;
  } else if (summary.inspirationCount === 0) {
    label = "Generate from base";
  } else {
    label = `Generate from base + ${summary.inspirationCount} inspiration${
      summary.inspirationCount === 1 ? "" : "s"
    }`;
  }

  return (
    <div className="generate-share-panel">
      <div className="provider-toggle" role="group" aria-label="Image model provider">
        {(Object.keys(PROVIDER_LABELS) as ImageProvider[]).map((option) => (
          <button
            key={option}
            type="button"
            className={`tlui-button provider-toggle__option`}
            aria-pressed={provider === option}
            onClick={() => onProviderChange(option)}
          >
            <span className="tlui-button__label">{PROVIDER_LABELS[option]}</span>
          </button>
        ))}
      </div>

      <div className="role-controls">
        <span className="role-label">
          Bases: <strong>{summary.totalBaseCount}</strong>
          {" · "}Refs: <strong>{summary.totalReferenceCount}</strong>
          {summary.selectedImageCount > 0 ? (
            <>
              {" · "}sel{" "}
              <strong>
                {summary.selectedBaseCount}b
                {" / "}
                {summary.selectedReferenceCount}r
                {" / "}
                {summary.inspirationCount}i
              </strong>
            </>
          ) : null}
        </span>
        <div className="role-buttons">
          <button
            className="tlui-button role-button"
            type="button"
            disabled={summary.selectedImageCount === 0}
            onClick={() => toggleRole(editor, summary.selectedIds, "base")}
          >
            <span className="tlui-button__label">{baseToggleLabel}</span>
          </button>
          <button
            className="tlui-button role-button"
            type="button"
            disabled={summary.selectedImageCount === 0}
            onClick={() => toggleRole(editor, summary.selectedIds, "reference")}
          >
            <span className="tlui-button__label">{referenceToggleLabel}</span>
          </button>
        </div>
      </div>

      <input
        className="direction-input"
        type="text"
        placeholder="Optional direction (e.g. cozy, evening light)"
        value={direction}
        onChange={(event) => handleDirectionChange(event.target.value)}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter" && canGenerate) {
            event.preventDefault();
            onGenerate();
          }
        }}
        onKeyUp={(event) => event.stopPropagation()}
      />

      <button
        className="tlui-button tlui-button__primary generate-button"
        type="button"
        disabled={!canGenerate}
        onClick={onGenerate}
      >
        <span className="tlui-button__label">{label}</span>
      </button>

      {summary.runningCount > 0 ? (
        <div className="generate-status">
          {summary.runningCount} generation{summary.runningCount === 1 ? "" : "s"} in
          progress
        </div>
      ) : null}

      {note ? (
        <div className="generate-status generate-status--error">{note}</div>
      ) : null}
    </div>
  );
}
