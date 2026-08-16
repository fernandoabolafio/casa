"use client";

import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  type RecordProps,
  type TLShape,
} from "tldraw";

export const GENERATION_PLACEHOLDER_TYPE = "generation-placeholder" as const;

declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    [GENERATION_PLACEHOLDER_TYPE]: {
      w: number;
      h: number;
      state: "running" | "error";
      label: string;
      error: string;
    };
  }
}

export type GenerationPlaceholderShape = TLShape<typeof GENERATION_PLACEHOLDER_TYPE>;

const generationPlaceholderProps: RecordProps<GenerationPlaceholderShape> = {
  w: T.nonZeroNumber,
  h: T.nonZeroNumber,
  state: T.literalEnum("running", "error"),
  label: T.string,
  error: T.string,
};

export class GenerationPlaceholderShapeUtil extends BaseBoxShapeUtil<GenerationPlaceholderShape> {
  static override type = GENERATION_PLACEHOLDER_TYPE;
  static override props = generationPlaceholderProps;

  override canEdit = () => false;
  override canResize = () => false;
  override hideRotateHandle = () => true;
  override hideResizeHandles = () => true;
  override isAspectRatioLocked = () => true;

  override getDefaultProps(): GenerationPlaceholderShape["props"] {
    return {
      w: 480,
      h: 320,
      state: "running",
      label: "Generating…",
      error: "",
    };
  }

  override component(shape: GenerationPlaceholderShape) {
    const { state, label, error, w, h } = shape.props;
    const isError = state === "error";

    return (
      <HTMLContainer
        style={{
          width: w,
          height: h,
          pointerEvents: "all",
        }}
      >
        <div
          className={`generation-placeholder${isError ? " generation-placeholder--error" : ""}`}
        >
          {isError ? (
            <>
              <div className="generation-placeholder__title">Generation failed</div>
              <div className="generation-placeholder__message">
                {error || "Something went wrong."}
              </div>
              <div className="generation-placeholder__hint">Delete this card to dismiss.</div>
            </>
          ) : (
            <>
              <div className="generation-placeholder__spinner" aria-hidden="true" />
              <div className="generation-placeholder__title">{label}</div>
              <div className="generation-placeholder__hint">
                Keep working — we&apos;ll drop it in here when it&apos;s done.
              </div>
            </>
          )}
        </div>
      </HTMLContainer>
    );
  }

  override indicator(shape: GenerationPlaceholderShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={12} ry={12} />;
  }
}
