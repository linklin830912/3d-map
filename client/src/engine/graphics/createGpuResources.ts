import type { Mesh } from "../globe/createTileMeshes";
import type { GpuGeometry } from "../globe/type";

export function createGpuResources(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  mesh: Mesh,
): GpuGeometry {
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  const ebo = gl.createBuffer();

  if (!vao || !vbo || !ebo) {
    throw new Error("Failed to create geometry buffers");
  }

  gl.bindVertexArray(vao);

  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(program, "a_position");
  const uvLocation = gl.getAttribLocation(program, "a_uv");

  if (positionLocation < 0 || uvLocation < 0) {
    throw new Error("Vertex attributes not found in shader");
  }

  const stride = 5 * Float32Array.BYTES_PER_ELEMENT;

  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, stride, 0);

  gl.enableVertexAttribArray(uvLocation);
  gl.vertexAttribPointer(
    uvLocation,
    2,
    gl.FLOAT,
    false,
    stride,
    3 * Float32Array.BYTES_PER_ELEMENT,
  );

  gl.bindVertexArray(null);

  return {
    vao,
    vbo,
    ebo,
    indexCount: mesh.indices.length,
  };
}
