import { createShader } from "../graphics/createShader";
import {
  FRAGMEN_SHADER_GLOBE,
  VERTEX_SHADER_GLOBE,
} from "../graphics/shaders/globeShader";

export function renderThreeTextures(
  gl: WebGL2RenderingContext,
  images: [HTMLImageElement, HTMLImageElement, HTMLImageElement],
) {
  // const compileShader = (type: number, source: string): WebGLShader => {
  //   const shader = gl.createShader(type);

  //   if (!shader) {
  //     throw new Error("Failed to create shader");
  //   }

  //   gl.shaderSource(shader, source);
  //   gl.compileShader(shader);

  //   if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
  //     const message = gl.getShaderInfoLog(shader);
  //     gl.deleteShader(shader);
  //     throw new Error(message ?? "Shader compilation failed");
  //   }

  //   return shader;
  // };

  const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_GLOBE);

  const fragmentShader = createShader(
    gl,
    gl.FRAGMENT_SHADER,
    FRAGMEN_SHADER_GLOBE,
  );

  const program = gl.createProgram();

  if (!program) {
    throw new Error("Failed to create program");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Program linking failed");
  }

  // --------------------------------------------------
  // 2. Create shared square geometry
  // --------------------------------------------------

  const vertices = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]);

  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

  const vao = gl.createVertexArray();
  const vertexBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();

  if (!vao || !vertexBuffer || !indexBuffer) {
    throw new Error("Failed to create geometry resources");
  }

  gl.bindVertexArray(vao);

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(program, "a_position");

  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  // --------------------------------------------------
  // 3. Create instance buffer
  // --------------------------------------------------

  // Each instance:
  // offsetX, offsetY, textureLayer

  const instanceData = new Float32Array([
    -0.65, 0.0, 0, 0.0, 0.0, 1, 0.65, 0.0, 2,
  ]);

  const instanceBuffer = gl.createBuffer();

  if (!instanceBuffer) {
    throw new Error("Failed to create instance buffer");
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);

  gl.bufferData(gl.ARRAY_BUFFER, instanceData, gl.STATIC_DRAW);

  const offsetLocation = gl.getAttribLocation(program, "a_offset");

  const layerLocation = gl.getAttribLocation(program, "a_layer");

  const instanceStride = 3 * Float32Array.BYTES_PER_ELEMENT;

  gl.enableVertexAttribArray(offsetLocation);
  gl.vertexAttribPointer(offsetLocation, 2, gl.FLOAT, false, instanceStride, 0);
  gl.vertexAttribDivisor(offsetLocation, 1);

  gl.enableVertexAttribArray(layerLocation);
  gl.vertexAttribPointer(
    layerLocation,
    1,
    gl.FLOAT,
    false,
    instanceStride,
    2 * Float32Array.BYTES_PER_ELEMENT,
  );
  gl.vertexAttribDivisor(layerLocation, 1);

  // --------------------------------------------------
  // 4. Create texture array with three layers
  // --------------------------------------------------

  const width = images[0].width;
  const height = images[0].height;

  if (
    images.some((image) => image.width !== width || image.height !== height)
  ) {
    throw new Error("All images must have the same dimensions");
  }

  const textureArray = gl.createTexture();

  if (!textureArray) {
    throw new Error("Failed to create texture array");
  }

  gl.bindTexture(gl.TEXTURE_2D_ARRAY, textureArray);

  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, width, height, 3);

  images.forEach((image, layer) => {
    gl.texSubImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      0,
      0,
      layer,
      width,
      height,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      image,
    );
  });

  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);

  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // --------------------------------------------------
  // 5. Draw all three instances
  // --------------------------------------------------

  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clearColor(0.1, 0.1, 0.1, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(program);
  gl.bindVertexArray(vao);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, textureArray);

  const textureLocation = gl.getUniformLocation(program, "u_textureArray");

  gl.uniform1i(textureLocation, 0);

  gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, 3);

  // Keep these resources alive if you want to render again.
  return {
    program,
    vao,
    textureArray,
    vertexBuffer,
    indexBuffer,
    instanceBuffer,
    vertexShader,
    fragmentShader,
  };
}
