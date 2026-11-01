import { getOpenStreetMapTile } from "../api/tile";
import { createProgram } from "../core/createProgram";
import {
  FRAGMEN_SHADER_GLOBE,
  VERTEX_SHADER_GLOBE,
} from "../graphics/shaders/globeShader";
import { createTileInstance } from "../globe/createTileInstance";
import { getTileInstanceLocation } from "../globe/getTileInstanceLocation";
import { addTileDebugOverlay } from "../graphics/loadTileTexture";

export interface IRenderer {
  draw(mvp: Float32Array): void;
  dispose(): void;
}

export class GlobeRenderer implements IRenderer {
  private program: WebGLProgram | null = null;

  private vao: WebGLVertexArrayObject | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;
  private instanceBuffer: WebGLBuffer | null = null;

  private textureArray: WebGLTexture | null = null;

  private indices: Uint16Array = new Uint16Array();
  private instanceCount = 0;

  private mvpLocation: WebGLUniformLocation | null = null;

  private zoom: number;
  private longitudeRange: [number, number][] = [[-180, 180]];
  private latitudeRange: [number, number][] = [[-90, 90]];
  private gl: WebGL2RenderingContext;
  private disposed = false;

  private constructor(gl: WebGL2RenderingContext, zoom: number) {
    this.gl = gl;
    this.zoom = zoom;
  }

  static async create(
    gl: WebGL2RenderingContext,
    zoom: number,
  ): Promise<GlobeRenderer> {
    const renderer = new GlobeRenderer(gl, zoom);

    try {
      await renderer.initialize();
      return renderer;
    } catch (error) {
      renderer.dispose();
      throw error;
    }
  }

  private async initialize(): Promise<void> {
    this.initializeProgram();
    this.initializeGeometry();
    this.initializeShaderState();

    await this.updateTileData(
      this.zoom,
      this.longitudeRange,
      this.latitudeRange,
    );
  }

  private initializeProgram(): void {
    this.program = createProgram(
      this.gl,
      VERTEX_SHADER_GLOBE,
      FRAGMEN_SHADER_GLOBE,
    );
  }
  private initializeGeometry(): void {
    const gl = this.gl;

    if (!this.program) {
      throw new Error("Shader program has not been initialized");
    }

    const { vertices, indices } = createTileInstance();

    this.indices = indices;

    this.vao = gl.createVertexArray();
    this.vertexBuffer = gl.createBuffer();
    this.indexBuffer = gl.createBuffer();
    this.instanceBuffer = gl.createBuffer();

    if (
      !this.vao ||
      !this.vertexBuffer ||
      !this.indexBuffer ||
      !this.instanceBuffer
    ) {
      throw new Error("Failed to create geometry resources");
    }

    gl.bindVertexArray(this.vao);

    // Shared vertex data: [u, v].
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const uvLocation = gl.getAttribLocation(this.program, "a_uv");

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
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    // Configure the instance attribute.
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);

    const instanceLocation = gl.getAttribLocation(this.program, "a_instance");

    if (instanceLocation < 0) {
      throw new Error('Shader attribute "a_instance" was not found');
    }

    gl.enableVertexAttribArray(instanceLocation);

    gl.vertexAttribPointer(
      instanceLocation,
      4,
      gl.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
    );

    gl.vertexAttribDivisor(instanceLocation, 1);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  private initializeShaderState(): void {
    const gl = this.gl;

    if (!this.program) {
      throw new Error("Shader program has not been initialized");
    }

    this.mvpLocation = gl.getUniformLocation(this.program, "u_mvp");

    const textureLocation = gl.getUniformLocation(
      this.program,
      "u_textureArray",
    );

    if (this.mvpLocation === null || textureLocation === null) {
      throw new Error("Failed to locate shader uniforms");
    }

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    gl.useProgram(this.program);
    gl.uniform1i(textureLocation, 0);

    gl.useProgram(null);
  }

  private async updateTileData(
    zoom: number,
    longitudeRange: [number, number][],
    latitudeRange: [number, number][],
  ): Promise<void> {
    const gl = this.gl;

    if (this.disposed || !this.program || !this.vao || !this.instanceBuffer) {
      throw new Error("Renderer is not initialized");
    }

    // 1. Generate tile instance data.
    const instanceData = getTileInstanceLocation(
      zoom,
      longitudeRange,
      latitudeRange,
    );

    const floatsPerInstance = 4;
    const instanceCount = instanceData.length / floatsPerInstance;

    if (instanceData.length === 0 || !Number.isInteger(instanceCount)) {
      throw new Error("Invalid tile instance data");
    }

    // 2. Extract tile coordinates.
    const tileCoordinates = [];

    for (let i = 0; i < instanceCount; i++) {
      const offset = i * floatsPerInstance;

      tileCoordinates.push({
        x: instanceData[offset],
        y: instanceData[offset + 1],
        z: instanceData[offset + 2],
      });
    }

    const images: {
      image: ImageBitmap | null;
      x: number;
      y: number;
      z: number;
    }[] = [];

    let newTextureArray: WebGLTexture | null = null;

    try {
      // 3. Load corresponding OSM images.
      const loadedImages = await Promise.all(
        tileCoordinates.map(async ({ x, y, z }) => ({
          image: await getOpenStreetMapTile(x, y, z),
          x,
          y,
          z,
        })),
      );

      images.push(...loadedImages);

      if (this.disposed) {
        throw new Error("Renderer was disposed while loading tiles");
      }

      if (images.length !== instanceCount || !images[0]?.image) {
        throw new Error("Failed to load map tiles");
      }

      const firstImage = images[0].image;
      const width = firstImage.width;
      const height = firstImage.height;

      // Verify all tiles loaded and have matching dimensions.
      for (const imageData of images) {
        if (!imageData.image) {
          throw new Error(
            `Failed to load tile ${imageData.z}/${imageData.x}/${imageData.y}`,
          );
        }

        if (
          imageData.image.width !== width ||
          imageData.image.height !== height
        ) {
          throw new Error("All map tiles must have equal dimensions");
        }
      }

      // 4. Create a new texture array.
      newTextureArray = gl.createTexture();

      if (!newTextureArray) {
        throw new Error("Failed to create texture array");
      }

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, newTextureArray);

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

      gl.texParameteri(
        gl.TEXTURE_2D_ARRAY,
        gl.TEXTURE_WRAP_S,
        gl.CLAMP_TO_EDGE,
      );

      gl.texParameteri(
        gl.TEXTURE_2D_ARRAY,
        gl.TEXTURE_WRAP_T,
        gl.CLAMP_TO_EDGE,
      );

      // 5. Process and upload each tile.
      for (let layer = 0; layer < images.length; layer++) {
        const imageData = images[layer];
        const image = imageData.image;

        if (!image) {
          throw new Error("Missing tile image");
        }

        const debugImage = await addTileDebugOverlay(
          image,
          imageData.x,
          imageData.y,
          imageData.z,
        );

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
          debugImage,
        );
      }

      gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);

      // 6. Upload instance data.
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);

      gl.bufferData(gl.ARRAY_BUFFER, instanceData, gl.STATIC_DRAW);

      gl.bindBuffer(gl.ARRAY_BUFFER, null);

      // 7. Replace the previous texture array.
      const previousTextureArray = this.textureArray;

      this.textureArray = newTextureArray;
      newTextureArray = null;

      this.instanceCount = instanceCount;

      this.zoom = zoom;
      this.longitudeRange = longitudeRange;
      this.latitudeRange = latitudeRange;

      if (previousTextureArray) {
        gl.deleteTexture(previousTextureArray);
      }
    } catch (error) {
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);

      if (newTextureArray) {
        gl.deleteTexture(newTextureArray);
      }

      throw error;
    } finally {
      // 8. Release CPU-side image resources.
      for (const imageData of images) {
        imageData.image?.close();
      }
    }
  }

  async updateZoom(
    zoom: number,
    // longitudeRange: [number, number][],
    // latitudeRange: [number, number][],
  ): Promise<void> {
    if (this.disposed) {
      throw new Error("Cannot update a disposed renderer");
    }

    if (
      zoom === this.zoom //&&
      // longitudeRange === this.longitudeRange &&
      // latitudeRange === this.latitudeRange
    ) {
      return;
    }
    this.zoom = zoom;
    // this.longitudeRange = longitudeRange;
    // this.latitudeRange = latitudeRange;
    await this.updateTileData(
      this.zoom,
      this.longitudeRange,
      this.latitudeRange,
    );
  }

  draw(mvp: Float32Array): void {
    if (
      this.disposed ||
      !this.program ||
      !this.vao ||
      !this.textureArray ||
      !this.mvpLocation
    ) {
      return;
    }

    const gl = this.gl;

    gl.clearColor(0.02, 0.03, 0.06, 1);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(this.program);

    gl.uniformMatrix4fv(this.mvpLocation, false, mvp);

    gl.activeTexture(gl.TEXTURE0);

    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.textureArray);

    gl.bindVertexArray(this.vao);

    gl.drawElementsInstanced(
      gl.TRIANGLES,
      this.indices.length,
      gl.UNSIGNED_SHORT,
      0,
      this.instanceCount,
    );

    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    gl.useProgram(null);
  }

  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;

    const gl = this.gl;

    if (this.vao) {
      gl.deleteVertexArray(this.vao);
      this.vao = null;
    }

    if (this.vertexBuffer) {
      gl.deleteBuffer(this.vertexBuffer);
      this.vertexBuffer = null;
    }

    if (this.indexBuffer) {
      gl.deleteBuffer(this.indexBuffer);
      this.indexBuffer = null;
    }

    if (this.instanceBuffer) {
      gl.deleteBuffer(this.instanceBuffer);
      this.instanceBuffer = null;
    }

    if (this.textureArray) {
      gl.deleteTexture(this.textureArray);
      this.textureArray = null;
    }

    if (this.program) {
      gl.deleteProgram(this.program);
      this.program = null;
    }

    this.mvpLocation = null;
    this.instanceCount = 0;
  }
}
