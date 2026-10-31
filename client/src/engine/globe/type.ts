export type GpuGeometry = {
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  ebo: WebGLBuffer;
  indexCount: number;
};

export type GpuTile = {
  geometry: GpuGeometry;
  texture: WebGLTexture;
  x: number;
  y: number;
  z: number;
};
