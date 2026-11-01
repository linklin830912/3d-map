import { useCallback, useRef } from "react";
import {
  multiply,
  perspective,
  rotationX,
  rotationY,
} from "../../engine/math/mat4";
import {
  MAX_CAMERA_DISTANCE,
  MIN_CAMERA_DISTANCE,
  ROTATION_SPEED,
  ZOOM_SPEED,
} from "./type";
import { useGlobeInit } from "./useGlobeInit";
import type { GlobeRenderer } from "../../engine/renderer/GlobeRenderer";
import { FOV } from "../../const/camera";
import { getGlobeRadius } from "../../engine/globe/getGlobeRadius";
import { screenToGeo } from "../../engine/globe/screenToGeo";

export default function GlobeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const disposedRef = useRef(false);

  const globeRendererRef = useRef<GlobeRenderer | null>(null);

  const animationFrameRef = useRef<number | null>(null);

  const rotationAngleRef = useRef<[number, number]>([0.25, 0]);

  const isDraggingRef = useRef(false);

  const previousPosRef = useRef<[number, number]>([0, 0]);

  const cameraDistanceRef = useRef(3);

  const requestRender = useCallback(() => {
    if (animationFrameRef.current !== null) {
      return;
    }
    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null;

      if (
        disposedRef.current ||
        !canvasRef.current ||
        !globeRendererRef.current ||
        canvasRef.current.width === 0 ||
        canvasRef.current.height === 0
      ) {
        return;
      }

      const canvas = canvasRef.current;
      const renderer = globeRendererRef.current;
      const aspectRatio = canvas.width / canvas.height;
      const projection = perspective(FOV, aspectRatio, 0.1, 100);

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
        -cameraDistanceRef.current,
        1,
      ]);

      const model = multiply(
        rotationY(rotationAngleRef.current[1]),
        rotationX(rotationAngleRef.current[0]),
      );

      const mvp = multiply(projection, multiply(view, model));

      renderer.draw(mvp);
    });
  }, []);

  const resize = useCallback(
    (gl: WebGL2RenderingContext) => {
      const canvas = canvasRef.current;

      if (!canvas) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      const width = Math.floor(canvas.clientWidth * dpr);
      const height = Math.floor(canvas.clientHeight * dpr);

      if (width === 0 || height === 0) return;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;

        gl.viewport(0, 0, width, height);
      }

      requestRender();
    },
    [requestRender],
  );

  const handlePointerDown = (event: PointerEvent) => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    isDraggingRef.current = true;

    previousPosRef.current = [event.clientX, event.clientY];

    canvas.style.cursor = "grabbing";

    canvas.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!isDraggingRef.current) return;

    const deltaX = event.clientX - previousPosRef.current[0];
    const deltaY = event.clientY - previousPosRef.current[1];

    const [rotationXAngle, rotationYAngle] = rotationAngleRef.current;

    rotationAngleRef.current = [
      rotationXAngle + deltaY * ROTATION_SPEED,
      rotationYAngle + deltaX * ROTATION_SPEED,
    ];

    previousPosRef.current = [event.clientX, event.clientY];

    requestRender();
  };

  const handlePointerUp = () => {
    const canvas = canvasRef.current;

    isDraggingRef.current = false;

    if (canvas) {
      canvas.style.cursor = "grab";
    }
  };

  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();

    cameraDistanceRef.current += event.deltaY * ZOOM_SPEED;
    cameraDistanceRef.current = Math.max(
      MIN_CAMERA_DISTANCE,
      Math.min(MAX_CAMERA_DISTANCE, cameraDistanceRef.current),
    );

    if (globeRendererRef.current && canvasRef.current) {
      // const radius = getGlobeRadius(
      //   cameraDistanceRef.current,
      //   canvasRef.current?.height,
      //   FOV,
      // );
      // console.log("!!!radius", radius);
      //!!!TODO: bug
      // const options = {
      //   canvasWidth: canvasRef.current.width,
      //   canvasHeight: canvasRef.current.height,
      //   cameraDistance: cameraDistanceRef.current,
      //   rotationX: rotationAngleRef.current[0],
      //   rotationY: rotationAngleRef.current[1],
      // };
      // const lonlat = screenToGeo(options);
      // if (!lonlat) return;
      // globeRendererRef.current.updateZoom(
      //   lonlat.longitudeRange,
      //   lonlat.latitudeRange,
      // );
    }

    requestRender();
  };

  useGlobeInit(
    canvasRef,
    disposedRef,
    globeRendererRef,
    animationFrameRef,
    resize,
    requestRender,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleWheel,
  );

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
