import { useEffect, useRef } from "react";

import {
  FRAGMEN_SHADER_SIMPLE,
  VERTEX_SHADER_SIMPLE,
} from "../engine/graphics/shaders/simpleShader";

import { createShader } from "../engine/graphics/createShader";
import { renderTileMeshes } from "../engine/globe/renderTileMeshes";

import {
  multiply,
  perspective,
  rotationX,
  rotationY,
} from "../engine/math/mat4";
import type { GpuTile } from "../engine/globe/type";

export default function MapCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2");

    if (!gl) {
      console.error("WebGL2 is not supported");
      return;
    }

    const vertexShader = createShader(
      gl,
      gl.VERTEX_SHADER,
      VERTEX_SHADER_SIMPLE,
    );

    const fragmentShader = createShader(
      gl,
      gl.FRAGMENT_SHADER,
      FRAGMEN_SHADER_SIMPLE,
    );

    const program = gl.createProgram();

    if (!program) {
      throw new Error("Failed to create WebGL program");
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(
        gl.getProgramInfoLog(program) ?? "Program linking failed",
      );
    }

    gl.useProgram(program);

    const mvpLocation = gl.getUniformLocation(program, "u_mvp");
    const textureLocation = gl.getUniformLocation(program, "u_texture");

    gl.uniform1i(textureLocation, 0);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);

    let gpuTiles: GpuTile[] = [];
    let disposed = false;

    const initializeTiles = async () => {
      try {
        const tiles = await renderTileMeshes(
          gl,
          program,
          2,
          [-180, 180],
          [-90, 90],
        );

        if (disposed) {
          disposeTiles(gl, tiles);
          return;
        }

        gpuTiles = tiles;
      } catch (error) {
        console.error("Failed to initialize tiles:", error);
      }
    };

    void initializeTiles();

    let animationFrame = 0;

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

    const handlePointerDown = (event: PointerEvent) => {
      isDragging = true;
      previousX = event.clientX;
      previousY = event.clientY;
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
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      cameraDistance += event.deltaY * zoomSpeed;

      cameraDistance = Math.max(
        minCameraDistance,
        Math.min(maxCameraDistance, cameraDistance),
      );
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      const width = Math.floor(canvas.clientWidth * dpr);
      const height = Math.floor(canvas.clientHeight * dpr);

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      gl.viewport(0, 0, width, height);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    const render = () => {
      resize();

      gl.clearColor(0.02, 0.03, 0.06, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const projection = perspective(
        Math.PI / 4,
        canvas.width / canvas.height,
        0.1,
        100,
      );

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

      gl.useProgram(program);
      gl.uniformMatrix4fv(mvpLocation, false, mvp);

      gl.activeTexture(gl.TEXTURE0);

      for (const tile of gpuTiles) {
        gl.bindVertexArray(tile.geometry.vao);
        gl.bindTexture(gl.TEXTURE_2D, tile.texture);

        gl.drawElements(
          gl.TRIANGLES,
          tile.geometry.indexCount,
          gl.UNSIGNED_SHORT,
          0,
        );
      }

      animationFrame = requestAnimationFrame(render);
    };

    render();

    return () => {
      disposed = true;

      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();

      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerUp);
      canvas.removeEventListener("wheel", handleWheel);

      disposeTiles(gl, gpuTiles);

      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
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

function disposeTiles(gl: WebGL2RenderingContext, tiles: GpuTile[]) {
  for (const tile of tiles) {
    gl.deleteVertexArray(tile.geometry.vao);
    gl.deleteBuffer(tile.geometry.vbo);
    gl.deleteBuffer(tile.geometry.ebo);
    gl.deleteTexture(tile.texture);
  }
}
