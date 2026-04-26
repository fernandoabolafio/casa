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

type GenerationInput = {
  composite: Blob;
  textHints: string[];
};

async function collectGenerationInputs(editor: Editor): Promise<GenerationInput[]> {
  const selectedImages = editor.getSelectedShapes().filter(isImageShape);

  if (selectedImages.length === 0) {
    return [];
  }

  const allShapes = editor.getCurrentPageShapes();
  const inputs: GenerationInput[] = [];

  for (const image of selectedImages) {
    const imageBounds = editor.getShapePageBounds(image);

    if (!imageBounds) {
      continue;
    }

    const overlapping = allShapes.filter((shape) => {
      if (shape.id === image.id) return false;
      if (isImageShape(shape)) return false;

      const bounds = editor.getShapePageBounds(shape);
      return bounds ? bounds.collides(imageBounds) : false;
    });

    const ids = [image.id, ...overlapping.map((shape) => shape.id)];
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

    inputs.push({ composite: result.blob, textHints });
  }

  return inputs;
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

        await addImageDataUrls(items, options);
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

      let inputs: GenerationInput[] = [];
      try {
        inputs = await collectGenerationInputs(editor);
      } catch (caught) {
        reportError(
          caught instanceof Error
            ? caught.message
            : "Could not prepare the selected images.",
        );
        return;
      }

      if (inputs.length === 0) {
        reportError("Select one or more images on the canvas before generating.");
        return;
      }

      const formData = new FormData();
      formData.append("provider", provider);
      inputs.forEach((input, index) => {
        formData.append("referenceImages", input.composite, `reference-${index}.png`);
        input.textHints.forEach((hint) => {
          formData.append("textHints", hint);
        });
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
          { select: true },
        );
      } catch (caught) {
        reportError(caught instanceof Error ? caught.message : "Generation failed.");
      } finally {
        setIsGenerating(false);
        setStatusMessage(null);
      }
    }, [addImageDataUrls, isGenerating, provider, reportError]);

    useImperativeHandle(ref, () => ({ addFiles }), [addFiles]);

    const components: TLComponents = useMemo(
      () => ({
        SharePanel: () => (
          <GenerateSharePanel
            isGenerating={isGenerating}
            statusMessage={statusMessage}
            errorMessage={errorMessage}
            provider={provider}
            onProviderChange={setProvider}
            onGenerate={runGeneration}
          />
        ),
      }),
      [errorMessage, isGenerating, provider, runGeneration, setProvider, statusMessage],
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

function GenerateSharePanel({
  isGenerating,
  statusMessage,
  errorMessage,
  provider,
  onProviderChange,
  onGenerate,
}: {
  isGenerating: boolean;
  statusMessage: string | null;
  errorMessage: string | null;
  provider: ImageProvider;
  onProviderChange: (next: ImageProvider) => void;
  onGenerate: () => void;
}) {
  const editor = useEditor();
  const selectedImageCount = useValue(
    "selected image count",
    () => editor.getSelectedShapes().filter(isImageShape).length,
    [editor],
  );

  const disabled = isGenerating || selectedImageCount === 0;
  const note = errorMessage ?? statusMessage;

  let label: string;
  if (isGenerating) {
    label = "Generating...";
  } else if (selectedImageCount === 0) {
    label = "Generate";
  } else {
    label = `Generate from ${selectedImageCount} image${selectedImageCount === 1 ? "" : "s"}`;
  }

  return (
    <div className="generate-share-panel">
      <div className="provider-toggle" role="group" aria-label="Image model provider">
        {(Object.keys(PROVIDER_LABELS) as ImageProvider[]).map((option) => (
          <button
            key={option}
            type="button"
            className={`tlui-button provider-toggle__option${
              provider === option ? " provider-toggle__option--active" : ""
            }`}
            disabled={isGenerating}
            aria-pressed={provider === option}
            onClick={() => onProviderChange(option)}
          >
            <span className="tlui-button__label">{PROVIDER_LABELS[option]}</span>
          </button>
        ))}
      </div>
      <button
        className="tlui-button tlui-button__primary generate-button"
        type="button"
        disabled={disabled}
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
