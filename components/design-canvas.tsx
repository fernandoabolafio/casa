"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { exportAlphaMask, type MaskExport } from "@/lib/image-mask";
import type { GeneratedScene } from "@/lib/types";

export type DesignCanvasHandle = {
  exportMask: () => Promise<MaskExport>;
  clearMask: () => void;
};

type DesignCanvasProps = {
  currentScene: GeneratedScene | null;
  scenes: GeneratedScene[];
  brushSize: number;
  brushEnabled: boolean;
  onSelectScene: (sceneId: string) => void;
};

export const DesignCanvas = forwardRef<DesignCanvasHandle, DesignCanvasProps>(
  function DesignCanvas(
    { currentScene, scenes, brushSize, brushEnabled, onSelectScene },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [imageSize, setImageSize] = useState({ width: 1536, height: 1024 });
    const [isPainting, setIsPainting] = useState(false);

    const clearMask = () => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");

      if (!canvas || !context) {
        return;
      }

      context.clearRect(0, 0, canvas.width, canvas.height);
    };

    useImperativeHandle(
      ref,
      () => ({
        exportMask: async () => {
          const canvas = canvasRef.current;

          if (!canvas) {
            throw new Error("Mask canvas is not ready.");
          }

          return exportAlphaMask(canvas, imageSize.width, imageSize.height);
        },
        clearMask,
      }),
      [imageSize.height, imageSize.width],
    );

    useEffect(() => {
      clearMask();
    }, [currentScene?.id]);

    const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;

      if (!canvas) {
        return null;
      }

      const rect = canvas.getBoundingClientRect();

      return {
        x: ((event.clientX - rect.left) / rect.width) * canvas.width,
        y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      };
    };

    const paint = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!brushEnabled) {
        return;
      }

      const canvas = canvasRef.current;
      const point = getPoint(event);
      const context = canvas?.getContext("2d");

      if (!canvas || !context || !point) {
        return;
      }

      context.globalCompositeOperation = "source-over";
      context.fillStyle = "rgba(255, 255, 255, 0.72)";
      context.beginPath();
      context.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
      context.fill();
    };

    return (
      <section className="workspace">
        <div className="hero panel">
          <div>
            <span className="eyebrow">Canvas Home Design MVP</span>
            <h1>Define the room, then reshape the scene.</h1>
          </div>
          <p className="small muted">
            Generate a first design from your reference set, brush over the area
            to change, queue refinements, and submit a focused image edit.
          </p>
        </div>

        <div className="canvas-panel panel">
          <div className="canvas-toolbar">
            <span className="status small">
              {brushEnabled
                ? `Brush active: ${brushSize}px`
                : "Generate a scene to start brushing"}
            </span>
            <button
              className="button"
              disabled={!currentScene}
              type="button"
              onClick={clearMask}
            >
              Clear brush
            </button>
          </div>
          <div className="canvas-stage">
            {currentScene ? (
              <div className="scene-frame">
                <img
                  alt="Generated interior design scene"
                  draggable={false}
                  src={currentScene.dataUrl}
                  onLoad={(event) => {
                    const image = event.currentTarget;
                    setImageSize({
                      width: image.naturalWidth || 1536,
                      height: image.naturalHeight || 1024,
                    });
                  }}
                />
                <canvas
                  ref={canvasRef}
                  aria-label="Brush mask canvas"
                  height={imageSize.height}
                  width={imageSize.width}
                  onPointerCancel={() => setIsPainting(false)}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setIsPainting(true);
                    paint(event);
                  }}
                  onPointerMove={(event) => {
                    if (isPainting) {
                      paint(event);
                    }
                  }}
                  onPointerUp={(event) => {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    setIsPainting(false);
                  }}
                />
              </div>
            ) : (
              <div className="empty-canvas">
                <div>
                  <h2>No scene generated yet</h2>
                  <p className="small">
                    Add room images, upload a floor plan, and generate the first
                    design scene from the right panel.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="history-strip panel">
          {scenes.length > 0 ? (
            scenes.map((scene) => (
              <button
                className={`history-button ${scene.id === currentScene?.id ? "active" : ""}`}
                key={scene.id}
                type="button"
                onClick={() => onSelectScene(scene.id)}
              >
                <img alt={scene.prompt} src={scene.dataUrl} />
              </button>
            ))
          ) : (
            <p className="small muted">Generated scenes will appear here.</p>
          )}
        </div>
      </section>
    );
  },
);
