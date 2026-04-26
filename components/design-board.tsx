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
import type { ApiSceneResponse, ImageProvider } from "@/lib/types";

const PROVIDER_STORAGE_KEY = "casa.imageProvider";

const PROVIDER_LABELS: Record<ImageProvider, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
};

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

function getRole(shape: TLShape): "base" | undefined {
  const role = (shape.meta as { role?: string } | undefined)?.role;
  return role === "base" ? "base" : undefined;
}

function findBaseImage(editor: Editor): TLImageShape | null {
  return (
    editor
      .getCurrentPageShapes()
      .filter(isImageShape)
      .find((shape) => getRole(shape) === "base") ?? null
  );
}

function setBaseImage(editor: Editor, nextBaseId: TLShapeId | null) {
  const allImages = editor.getCurrentPageShapes().filter(isImageShape);
  const updates = allImages
    .filter((shape) => getRole(shape) === "base" || shape.id === nextBaseId)
    .map((shape) => {
      const meta = (shape.meta ?? {}) as Record<string, unknown>;
      const { role: _ignored, ...rest } = meta as { role?: unknown };
      return {
        id: shape.id,
        type: "image" as const,
        meta:
          shape.id === nextBaseId
            ? { ...rest, role: "base" as const }
            : rest,
      };
    });

  if (updates.length > 0) {
    editor.updateShapes(updates);
  }
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
  base: CollectedInput | null;
  inspirations: CollectedInput[];
};

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

    const bounds = editor.getShapePageBounds(shape);
    return bounds ? bounds.collides(imageBounds) : false;
  });

  const ids = [imageShape.id, ...overlapping.map((shape) => shape.id)];
  const result = await editor.toImage(ids, {
    format: "png",
    background: false,
    padding: 0,
    bounds: imageBounds,
    scale: 1,
  });

  const textHints = overlapping
    .filter(isTextShape)
    .map((shape) => richTextToPlainText(shape.props.richText).trim())
    .filter((text): text is string => Boolean(text));

  return { composite: result.blob, textHints };
}

async function collectGenerationInputs(editor: Editor): Promise<GenerationCollection> {
  const allShapes = editor.getCurrentPageShapes();
  const baseShape = findBaseImage(editor);
  const selectedImages = editor.getSelectedShapes().filter(isImageShape);

  const base = baseShape
    ? await flattenImageWithAnnotations(editor, baseShape, allShapes)
    : null;

  const inspirationShapes = selectedImages.filter(
    (shape) => shape.id !== baseShape?.id,
  );

  const inspirations: CollectedInput[] = [];
  for (const shape of inspirationShapes) {
    const collected = await flattenImageWithAnnotations(editor, shape, allShapes);
    if (collected) inspirations.push(collected);
  }

  return { base, inspirations };
}

async function readSceneResponse(response: Response): Promise<ApiSceneResponse> {
  const payload = (await response.json()) as ApiSceneResponse & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "The image request failed.");
  }

  return payload;
}

type DesignBoardProps = {
  onError?: (message: string | null) => void;
};

export const DesignBoard = forwardRef<DesignBoardHandle, DesignBoardProps>(
  function DesignBoard({ onError }, ref) {
    const editorRef = useRef<Editor | null>(null);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [provider, setProviderState] = useState<ImageProvider>("openai");
    const [direction, setDirection] = useState("");

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
        options?: AddImageOptions,
      ) => {
        const editor = editorRef.current;

        if (!editor) {
          throw new Error("Canvas is not ready yet.");
        }

        const basePoint =
          options?.point ??
          editor.getSelectionPageBounds()?.center ??
          editor.getViewportPageBounds().center;
        const createdIds: TLImageShape["id"][] = [];

        for (const [index, item] of items.entries()) {
          const naturalSize = await getImageSize(item.dataUrl);
          const size = fitImageSize(naturalSize.width, naturalSize.height);
          const id = createShapeId() as TLImageShape["id"];
          const offset = index * 32;
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

          editor.createShape<TLImageShape>({
            id,
            type: "image",
            x: basePoint.x + offset - size.width / 2,
            y: basePoint.y + offset - size.height / 2,
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
          createdIds.push(id);
        }

        if (options?.select !== false && createdIds.length > 0) {
          editor.setSelectedShapes(createdIds);
        }

        if (options?.autoAssignBase && createdIds.length > 0 && !findBaseImage(editor)) {
          setBaseImage(editor, createdIds[0]);
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

    const runGeneration = useCallback(async () => {
      if (isGenerating) return;

      const editor = editorRef.current;

      if (!editor) {
        reportError("Canvas is not ready yet.");
        return;
      }

      reportError(null);

      let collection: GenerationCollection;
      try {
        collection = await collectGenerationInputs(editor);
      } catch (caught) {
        reportError(
          caught instanceof Error
            ? caught.message
            : "Could not prepare the selected images.",
        );
        return;
      }

      const trimmedDirection = direction.trim();

      if (!collection.base && collection.inspirations.length === 0) {
        reportError(
          "Pin a base image or select at least one inspiration before generating.",
        );
        return;
      }

      const formData = new FormData();
      formData.append("provider", provider);
      if (trimmedDirection) {
        formData.append("direction", trimmedDirection);
      }

      if (collection.base) {
        formData.append("baseImage", collection.base.composite, "base.png");
        collection.base.textHints.forEach((hint) => {
          formData.append("baseHints", hint);
        });
      }

      collection.inspirations.forEach((input, index) => {
        formData.append(
          "inspirationImages",
          input.composite,
          `inspiration-${index}.png`,
        );
        formData.append("inspirationHints", JSON.stringify(input.textHints));
      });

      setIsGenerating(true);
      setStatusMessage("Generating. This can take up to 2 min.");

      try {
        const response = await fetch("/api/generate-scene", {
          method: "POST",
          body: formData,
        });
        const payload = await readSceneResponse(response);
        await addImageDataUrls(
          [{ dataUrl: payload.image, name: "Generated interior scene" }],
          { select: true, autoAssignBase: false },
        );
      } catch (caught) {
        reportError(caught instanceof Error ? caught.message : "Generation failed.");
      } finally {
        setIsGenerating(false);
        setStatusMessage(null);
      }
    }, [addImageDataUrls, direction, isGenerating, provider, reportError]);

    useImperativeHandle(ref, () => ({ addFiles }), [addFiles]);

    const components: TLComponents = useMemo(
      () => ({
        InFrontOfTheCanvas: () => <BaseImageBadge />,
        SharePanel: () => (
          <GenerateSharePanel
            isGenerating={isGenerating}
            statusMessage={statusMessage}
            errorMessage={errorMessage}
            provider={provider}
            onProviderChange={setProvider}
            direction={direction}
            onDirectionChange={setDirection}
            onGenerate={runGeneration}
          />
        ),
      }),
      [
        direction,
        errorMessage,
        isGenerating,
        provider,
        runGeneration,
        setProvider,
        statusMessage,
      ],
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
          components={components}
          onMount={(editor) => {
            editorRef.current = editor;

            return () => {
              editorRef.current = null;
            };
          }}
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

function BaseImageBadge() {
  const editor = useEditor();
  const placement = useValue(
    "base image badge placement",
    () => {
      const base = findBaseImage(editor);
      if (!base) return null;
      const bounds = editor.getShapePageBounds(base);
      if (!bounds) return null;
      const topLeft = editor.pageToViewport({ x: bounds.x, y: bounds.y });
      return { x: topLeft.x, y: topLeft.y };
    },
    [editor],
  );

  if (!placement) return null;

  return (
    <div
      className="base-badge"
      style={{
        transform: `translate(${placement.x}px, ${placement.y}px)`,
      }}
    >
      Base
    </div>
  );
}

function GenerateSharePanel({
  isGenerating,
  statusMessage,
  errorMessage,
  provider,
  onProviderChange,
  direction,
  onDirectionChange,
  onGenerate,
}: {
  isGenerating: boolean;
  statusMessage: string | null;
  errorMessage: string | null;
  provider: ImageProvider;
  onProviderChange: (next: ImageProvider) => void;
  direction: string;
  onDirectionChange: (next: string) => void;
  onGenerate: () => void;
}) {
  const editor = useEditor();

  const summary = useValue(
    "generation summary",
    () => {
      const base = findBaseImage(editor);
      const selected = editor.getSelectedShapes().filter(isImageShape);
      const selectedNonBase = selected.filter((s) => s.id !== base?.id);
      const onlyOneSelected = selected.length === 1;
      const singleSelected = onlyOneSelected ? selected[0] : null;
      const singleSelectedIsBase = singleSelected
        ? singleSelected.id === base?.id
        : false;

      return {
        hasBase: Boolean(base),
        baseId: base?.id ?? null,
        inspirationCount: selectedNonBase.length,
        canSetSelectedAsBase: Boolean(singleSelected) && !singleSelectedIsBase,
        singleSelectedId: singleSelected?.id ?? null,
      };
    },
    [editor],
  );

  const canGenerate =
    !isGenerating && (summary.hasBase || summary.inspirationCount > 0);
  const note = errorMessage ?? statusMessage;

  let label: string;
  if (isGenerating) {
    label = "Generating...";
  } else if (!summary.hasBase && summary.inspirationCount === 0) {
    label = "Generate";
  } else if (summary.hasBase && summary.inspirationCount > 0) {
    label = `Generate from base + ${summary.inspirationCount} inspiration${
      summary.inspirationCount === 1 ? "" : "s"
    }`;
  } else if (summary.hasBase) {
    label = "Generate from base";
  } else {
    label = `Generate from ${summary.inspirationCount} inspiration${
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
            disabled={isGenerating}
            aria-pressed={provider === option}
            onClick={() => onProviderChange(option)}
          >
            <span className="tlui-button__label">{PROVIDER_LABELS[option]}</span>
          </button>
        ))}
      </div>

      <div className="role-controls">
        <span className="role-label">
          Base: <strong>{summary.hasBase ? "set" : "none"}</strong>
        </span>
        {summary.canSetSelectedAsBase && summary.singleSelectedId ? (
          <button
            className="tlui-button role-button"
            type="button"
            disabled={isGenerating}
            onClick={() => setBaseImage(editor, summary.singleSelectedId)}
          >
            <span className="tlui-button__label">Set as base</span>
          </button>
        ) : null}
        {summary.hasBase ? (
          <button
            className="tlui-button role-button"
            type="button"
            disabled={isGenerating}
            onClick={() => setBaseImage(editor, null)}
          >
            <span className="tlui-button__label">Clear base</span>
          </button>
        ) : null}
      </div>

      <input
        className="direction-input"
        type="text"
        placeholder="Optional direction (e.g. cozy, evening light)"
        value={direction}
        disabled={isGenerating}
        onChange={(event) => onDirectionChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && canGenerate) {
            event.preventDefault();
            onGenerate();
          }
        }}
      />

      <button
        className="tlui-button tlui-button__primary generate-button"
        type="button"
        disabled={!canGenerate}
        onClick={onGenerate}
      >
        <span className="tlui-button__label">{label}</span>
      </button>

      {note ? (
        <div
          className={`generate-status${errorMessage ? " generate-status--error" : ""}`}
        >
          {note}
        </div>
      ) : null}
    </div>
  );
}
