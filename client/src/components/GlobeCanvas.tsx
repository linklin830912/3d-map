import { useEffect, useRef } from "react";

import { renderGlobe } from "../engine/globe/renderGlobe";

import {
  multiply,
  perspective,
  rotationX,
  rotationY,
} from "../engine/math/mat4";

export default function GlobeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const gl = canvas.getContext("webgl2");

    if (!gl) {
      console.error("WebGL2 is not supported");
      return;
    }

    let disposed = false;
    let renderer: Awaited<ReturnType<typeof renderGlobe>> | null = null;
    let animationFrame = 0;

    // --------------------------------------------------
    // Camera state
    // --------------------------------------------------

    let rotationXAngle = 0.25;
    let rotationYAngle = 0;

    let isDragging = false;
    let previousX = 0;
    let previousY = 0;

    const rotationSpeed = 0.005;

    let cameraDistance = 3;

    const minCameraDistance = 1.5;
    const maxCameraDistance = 8;
    const zoomSpeed = 0.001;

    // --------------------------------------------------
    // Pointer controls
    // --------------------------------------------------

    const handlePointerDown = (event: PointerEvent) => {
      isDragging = true;

      previousX = event.clientX;
      previousY = event.clientY;

      canvas.style.cursor = "grabbing";
      canvas.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!isDragging) return;

      const deltaX = event.clientX - previousX;
      const deltaY = event.clientY - previousY;

      rotationYAngle += deltaX * rotationSpeed;
      rotationXAngle += deltaY * rotationSpeed;

      previousX = event.clientX;
      previousY = event.clientY;
    };

    const handlePointerUp = () => {
      isDragging = false;
      canvas.style.cursor = "grab";
    };

    // --------------------------------------------------
    // Zoom control
    // --------------------------------------------------

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      cameraDistance += event.deltaY * zoomSpeed;

      cameraDistance = Math.max(
        minCameraDistance,
        Math.min(maxCameraDistance, cameraDistance),
      );
    };

    // --------------------------------------------------
    // Canvas resizing
    // --------------------------------------------------

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      const width = Math.floor(canvas.clientWidth * dpr);
      const height = Math.floor(canvas.clientHeight * dpr);

      if (width === 0 || height === 0) return;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      gl.viewport(0, 0, width, height);
    };

    const resizeObserver = new ResizeObserver(resize);

    resizeObserver.observe(canvas);

    resize();

    // --------------------------------------------------
    // Render loop
    // --------------------------------------------------

    const render = () => {
      if (disposed) return;

      resize();

      if (renderer && canvas.width > 0 && canvas.height > 0) {
        const aspectRatio = canvas.width / canvas.height;

        const projection = perspective(Math.PI / 4, aspectRatio, 0.1, 100);

        const view = new Float32Array([
          1,
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          -cameraDistance,
          1,
        ]);

        const model = multiply(
          rotationY(rotationYAngle),
          rotationX(rotationXAngle),
        );

        const mvp = multiply(projection, multiply(view, model));

        renderer.draw(mvp);
      }

      animationFrame = requestAnimationFrame(render);
    };

    // --------------------------------------------------
    // Initialize globe
    // --------------------------------------------------

    const initialize = async () => {
      try {
        const globeRenderer = await renderGlobe(gl, 2);

        if (disposed) {
          globeRenderer.dispose();
          return;
        }

        renderer = globeRenderer;
      } catch (error) {
        console.error("Failed to initialize globe:", error);
      }
    };

    void initialize();

    render();

    // --------------------------------------------------
    // Register events
    // --------------------------------------------------

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);
    canvas.addEventListener("wheel", handleWheel, {
      passive: false,
    });

    // --------------------------------------------------
    // Cleanup
    // --------------------------------------------------

    return () => {
      disposed = true;

      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();

      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerUp);
      canvas.removeEventListener("wheel", handleWheel);

      renderer?.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        touchAction: "none",
        cursor: "grab",
      }}
    />
  );
}
