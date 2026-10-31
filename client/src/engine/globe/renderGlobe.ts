import { getOpenStreetMapTile } from "../api/tile";
import { createShader } from "../graphics/createShader";
import {
  FRAGMEN_SHADER_GLOBE,
  VERTEX_SHADER_GLOBE,
} from "../graphics/shaders/globeShader";
import { createTileInstance } from "./createTileInstance";
import { getTileInstanceLocation } from "./getTileInstanceLocation";

export interface GlobeRenderer {
  draw(mvp: Float32Array): void;
  dispose(): void;
}

export async function renderGlobe(
  gl: WebGL2RenderingContext,
  zoom: number,
): Promise<GlobeRenderer> {
  // --------------------------------------------------
  // 1. Create and link shader program
  // --------------------------------------------------

  const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_GLOBE);

  const fragmentShader = createShader(
    gl,
    gl.FRAGMENT_SHADER,
    FRAGMEN_SHADER_GLOBE,
  );

  const program = gl.createProgram();

  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error("Failed to create shader program");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "Program linking failed";

    gl.deleteProgram(program);
    throw new Error(message);
  }

  // --------------------------------------------------
  // 2. Create shared tile geometry
  // --------------------------------------------------

  const { vertices, indices } = createTileInstance();

  const vao = gl.createVertexArray();
  const vertexBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();

  if (!vao || !vertexBuffer || !indexBuffer) {
    gl.deleteVertexArray(vao);
    gl.deleteBuffer(vertexBuffer);
    gl.deleteBuffer(indexBuffer);
    gl.deleteProgram(program);

    throw new Error("Failed to create geometry resources");
  }

  gl.bindVertexArray(vao);

  // Shared vertex data: [u, v].
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const uvLocation = gl.getAttribLocation(program, "a_uv");

  if (uvLocation < 0) {
    throw new Error('Shader attribute "a_uv" was not found');
  }

  gl.enableVertexAttribArray(uvLocation);
  gl.vertexAttribPointer(
    uvLocation,
    2,
    gl.FLOAT,
    false,
    2 * Float32Array.BYTES_PER_ELEMENT,
    0,
  );

  // Shared index data.
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  // --------------------------------------------------
  // 3. Create tile instance data
  // --------------------------------------------------

  // Each instance:
  // [tileX, tileY, zoom, textureLayer]
  const instanceData = getTileInstanceLocation(zoom, [-180, 180], [-90, 90]);

  const floatsPerInstance = 4;
  const instanceCount = instanceData.length / floatsPerInstance;

  if (instanceData.length === 0 || !Number.isInteger(instanceCount)) {
    throw new Error("Invalid tile instance data");
  }

  const instanceBuffer = gl.createBuffer();

  if (!instanceBuffer) {
    throw new Error("Failed to create instance buffer");
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, instanceData, gl.STATIC_DRAW);

  const instanceLocation = gl.getAttribLocation(program, "a_instance");

  if (instanceLocation < 0) {
    throw new Error('Shader attribute "a_instance" was not found');
  }

  gl.enableVertexAttribArray(instanceLocation);
  gl.vertexAttribPointer(
    instanceLocation,
    4,
    gl.FLOAT,
    false,
    floatsPerInstance * Float32Array.BYTES_PER_ELEMENT,
    0,
  );

  gl.vertexAttribDivisor(instanceLocation, 1);

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  // --------------------------------------------------
  // 4. Load OSM tile images
  // --------------------------------------------------

  const tileCoordinates: {
    x: number;
    y: number;
    z: number;
  }[] = [];

  for (let i = 0; i < instanceCount; i++) {
    const offset = i * floatsPerInstance;

    tileCoordinates.push({
      x: instanceData[offset],
      y: instanceData[offset + 1],
      z: instanceData[offset + 2],
    });
  }

  const images = await Promise.all(
    tileCoordinates.map(({ x, y, z }) => getOpenStreetMapTile(x, y, z)),
  );

  if (images.length === 0 || images[0] == null) {
    throw new Error("Failed to load map tiles");
  }

  const firstImage = images[0];
  const width = firstImage.width;
  const height = firstImage.height;

  for (const image of images) {
    if (image == null) {
      throw new Error("One or more map tiles failed to load");
    }

    if (image.width !== width || image.height !== height) {
      throw new Error("All map tiles must have equal dimensions");
    }
  }

  // --------------------------------------------------
  // 5. Create texture array
  // --------------------------------------------------

  const textureArray = gl.createTexture();

  if (!textureArray) {
    throw new Error("Failed to create texture array");
  }

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, textureArray);

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);

  gl.texStorage3D(
    gl.TEXTURE_2D_ARRAY,
    1,
    gl.RGBA8,
    width,
    height,
    instanceCount,
  );

  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);

  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  images.forEach((image, layer) => {
    if (image == null) return;

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

  gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);

  // Release CPU-side image resources after uploading.
  for (const image of images) {
    if (image && "close" in image && typeof image.close === "function") {
      image.close();
    }
  }

  // --------------------------------------------------
  // 6. Get uniforms
  // --------------------------------------------------

  const mvpLocation = gl.getUniformLocation(program, "u_mvp");
  const textureLocation = gl.getUniformLocation(program, "u_textureArray");

  if (mvpLocation === null || textureLocation === null) {
    gl.deleteTexture(textureArray);
    gl.deleteVertexArray(vao);
    gl.deleteBuffer(vertexBuffer);
    gl.deleteBuffer(indexBuffer);
    gl.deleteBuffer(instanceBuffer);
    gl.deleteProgram(program);

    throw new Error("Failed to locate shader uniforms");
  }

  // --------------------------------------------------
  // 7. Configure WebGL state
  // --------------------------------------------------

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);

  gl.useProgram(program);
  gl.uniform1i(textureLocation, 0);

  // --------------------------------------------------
  // 8. Return renderer
  // --------------------------------------------------

  return {
    draw(mvp: Float32Array) {
      gl.clearColor(0.02, 0.03, 0.06, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      gl.useProgram(program);
      gl.uniformMatrix4fv(mvpLocation, false, mvp);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, textureArray);

      gl.bindVertexArray(vao);

      gl.drawElementsInstanced(
        gl.TRIANGLES,
        indices.length,
        gl.UNSIGNED_SHORT,
        0,
        instanceCount,
      );

      gl.bindVertexArray(null);
    },

    dispose() {
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(vertexBuffer);
      gl.deleteBuffer(indexBuffer);
      gl.deleteBuffer(instanceBuffer);
      gl.deleteTexture(textureArray);
      gl.deleteProgram(program);
    },
  };
}
