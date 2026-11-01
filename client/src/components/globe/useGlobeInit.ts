import { useEffect } from "react";
import { GlobeRenderer } from "../../engine/renderer/GlobeRenderer";

export function useGlobeInit(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  disposedRef: React.RefObject<boolean | null>,
  rendererRef: React.RefObject<GlobeRenderer | null>,
  animationFrameRef: React.RefObject<number | null>,
  resize: (gl: WebGL2RenderingContext) => void,
  requestRender: () => void,
  handlePointerDown: (event: PointerEvent) => void,
  handlePointerMove: (event: PointerEvent) => void,
  handlePointerUp: () => void,
  handleWheel: (event: WheelEvent) => void,
) {
  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const gl = canvas.getContext("webgl2");

    if (!gl) {
      console.error("WebGL2 is not supported");
      return;
    }

    disposedRef.current = false;

    const resizeObserver = new ResizeObserver(() => {
      resize(gl);
    });

    resizeObserver.observe(canvas);

    resize(gl);

    const initialize = async () => {
      try {
        rendererRef.current = await GlobeRenderer.create(gl, 2);

        if (disposedRef.current) {
          rendererRef.current.dispose();
          return;
        }

        requestRender();
      } catch (error) {
        console.error("Failed to initialize globe:", error);
      }
    };

    void initialize();

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);

    canvas.addEventListener("wheel", handleWheel, {
      passive: false,
    });

    return () => {
      disposedRef.current = true;

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      resizeObserver.disconnect();

      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerUp);
      canvas.removeEventListener("wheel", handleWheel);

      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [requestRender, resize]);
}
