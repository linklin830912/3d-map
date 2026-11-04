import { getOpenStreetMapTile, isAbortError } from "../api/tile";
import { createProgram } from "../core/createProgram";
import {
  FRAGMEN_SHADER_GLOBE,
  VERTEX_SHADER_GLOBE,
} from "../graphics/shaders/globeShader";
import { createTileInstance } from "../globe/createTileInstance";
import {
  buildTileInstanceData,
  getVisibleTiles,
} from "../globe/getTileInstanceLocation";
import {
  TileImageCache,
  tileKeyFromCoord,
  type TileCoord,
} from "../globe/tileCache";
import { addTileDebugOverlay } from "../graphics/tileDebugOverlay";

export interface IRenderer {
  draw(mvp: Float32Array): void;
  dispose(): void;
}

const DEFAULT_TEXTURE_CAPACITY = 64;
const CPU_CACHE_SIZE = 256;

function nextPowerOfTwo(value: number): number {
  let power = 1;

  while (power < value) {
    power *= 2;
  }

  return power;
}

function rangesEqual(
  a: [number, number][],
  b: [number, number][],
): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) {
      return false;
    }
  }

  return true;
}

function visibleTilesSignature(tiles: TileCoord[]): string {
  return tiles
    .map((tile) => tileKeyFromCoord(tile))
    .sort()
    .join("|");
}

export class GlobeRenderer implements IRenderer {
  private program: WebGLProgram | null = null;

  private vao: WebGLVertexArrayObject | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;
  private instanceBuffer: WebGLBuffer | null = null;

  private textureArray: WebGLTexture | null = null;
  private textureCapacity = 0;
  private tileWidth = 0;
  private tileHeight = 0;

  private readonly layerByTile = new Map<string, number>();
  private tileByLayer: Array<string | null> = [];
  private freeLayers: number[] = [];

  private readonly tileCache = new TileImageCache(CPU_CACHE_SIZE);

  private indices: Uint16Array = new Uint16Array();
  private instanceCount = 0;
  private activeTilesSignature = "";

  private mvpLocation: WebGLUniformLocation | null = null;

  private zoom: number;
  private longitudeRange: [number, number][] = [[-180, 180]];
  private latitudeRange: [number, number][] = [[-90, 90]];
  private gl: WebGL2RenderingContext;
  private disposed = false;
  private updateGeneration = 0;
  private activeAbort: AbortController | null = null;
  private renderRequest: (() => void) | null = null;

  setRenderRequest(callback: (() => void) | null): void {
    this.renderRequest = callback;
  }

  private requestRender(): void {
    this.renderRequest?.();
  }

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

    const abortController = new AbortController();
    this.activeAbort = abortController;
    const generation = ++this.updateGeneration;

    try {
      await this.updateTileData(
        this.zoom,
        this.longitudeRange,
        this.latitudeRange,
        generation,
        abortController.signal,
      );
    } finally {
      if (this.activeAbort === abortController) {
        this.activeAbort = null;
      }
    }
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

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

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

  private isCurrentUpdate(generation: number): boolean {
    return !this.disposed && generation === this.updateGeneration;
  }

  private releaseGpuLayer(key: string): void {
    const layer = this.layerByTile.get(key);

    if (layer === undefined) {
      return;
    }

    this.layerByTile.delete(key);
    this.tileByLayer[layer] = null;
    this.freeLayers.push(layer);
  }

  private releaseUnusedGpuLayers(neededKeys: Set<string>): void {
    for (const key of [...this.layerByTile.keys()]) {
      if (!neededKeys.has(key)) {
        this.releaseGpuLayer(key);
      }
    }
  }

  private resetLayerPool(capacity: number): void {
    this.layerByTile.clear();
    this.tileByLayer = Array.from({ length: capacity }, () => null);
    this.freeLayers = Array.from(
      { length: capacity },
      (_, index) => capacity - 1 - index,
    );
    this.textureCapacity = capacity;
  }

  private createTextureArray(
    width: number,
    height: number,
    capacity: number,
  ): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture();

    if (!texture) {
      throw new Error("Failed to create texture array");
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);

    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, width, height, capacity);

    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);

    return texture;
  }

  /**
   * Ensures the GPU texture array can hold at least minimumCapacity layers.
   * Returns true when a new texture was allocated (all layers must be re-uploaded).
   */
  private ensureTextureArray(
    width: number,
    height: number,
    minimumCapacity: number,
  ): boolean {
    const gl = this.gl;
    const capacity = Math.max(
      DEFAULT_TEXTURE_CAPACITY,
      nextPowerOfTwo(minimumCapacity),
    );

    const sizeChanged = this.tileWidth !== width || this.tileHeight !== height;
    const needsGrow = capacity > this.textureCapacity;

    if (this.textureArray && !sizeChanged && !needsGrow) {
      return false;
    }

    const previousTexture = this.textureArray;
    const texture = this.createTextureArray(width, height, capacity);

    this.textureArray = texture;
    this.tileWidth = width;
    this.tileHeight = height;
    this.resetLayerPool(capacity);

    if (previousTexture) {
      gl.deleteTexture(previousTexture);
    }

    return true;
  }

  private uploadTileToLayer(
    layer: number,
    source: HTMLCanvasElement | ImageBitmap,
    width: number,
    height: number,
  ): void {
    const gl = this.gl;

    if (!this.textureArray) {
      throw new Error("Texture array has not been created");
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.textureArray);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);

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
      source,
    );

    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
  }

  private async loadTileImage(
    tile: TileCoord,
    signal: AbortSignal,
  ): Promise<{
    source: HTMLCanvasElement | ImageBitmap;
    width: number;
    height: number;
  }> {
    const key = tileKeyFromCoord(tile);
    const cached = this.tileCache.get(key);

    if (cached) {
      return cached;
    }

    const image = await getOpenStreetMapTile(tile.x, tile.y, tile.z, signal);

    if (signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    if (!image) {
      throw new Error(`Failed to load tile ${key}`);
    }

    try {
      const debugImage = await addTileDebugOverlay(
        image,
        tile.x,
        tile.y,
        tile.z,
      );

      if (signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      this.tileCache.set(key, debugImage, debugImage.width, debugImage.height);

      return {
        source: debugImage,
        width: debugImage.width,
        height: debugImage.height,
      };
    } finally {
      image.close();
    }
  }

  private allocateLayer(key: string): number {
    const layer = this.freeLayers.pop();

    if (layer === undefined) {
      throw new Error("No free texture-array layers available");
    }

    this.layerByTile.set(key, layer);
    this.tileByLayer[layer] = key;

    return layer;
  }

  private async updateTileData(
    zoom: number,
    longitudeRange: [number, number][],
    latitudeRange: [number, number][],
    generation: number,
    signal: AbortSignal,
  ): Promise<void> {
    if (this.disposed || !this.program || !this.vao || !this.instanceBuffer) {
      throw new Error("Renderer is not initialized");
    }

    const tiles = getVisibleTiles(zoom, longitudeRange, latitudeRange);

    if (tiles.length === 0) {
      throw new Error("Invalid tile instance data");
    }

    const signature = visibleTilesSignature(tiles);

    if (signature === this.activeTilesSignature && this.textureArray) {
      this.zoom = zoom;
      this.longitudeRange = longitudeRange;
      this.latitudeRange = latitudeRange;
      return;
    }

    const loadResults = await Promise.all(
      tiles.map(async (tile) => {
        const key = tileKeyFromCoord(tile);

        try {
          const image = await this.loadTileImage(tile, signal);

          return { tile, key, ...image };
        } catch (error) {
          if (isAbortError(error)) {
            throw error;
          }

          console.warn(`Skipping tile ${key}:`, error);
          return null;
        }
      }),
    );

    if (!this.isCurrentUpdate(generation) || signal.aborted) {
      return;
    }

    const loadedTiles = loadResults.filter(
      (result): result is NonNullable<(typeof loadResults)[number]> =>
        result !== null,
    );

    if (loadedTiles.length === 0) {
      throw new Error("Failed to load any map tiles for the current view");
    }

    const width = loadedTiles[0].width;
    const height = loadedTiles[0].height;

    for (const image of loadedTiles) {
      if (image.width !== width || image.height !== height) {
        throw new Error("All map tiles must have equal dimensions");
      }
    }

    const neededKeys = new Set(loadedTiles.map(({ key }) => key));

    this.releaseUnusedGpuLayers(neededKeys);

    const textureRecreated = this.ensureTextureArray(
      width,
      height,
      loadedTiles.length,
    );

    if (!this.isCurrentUpdate(generation) || !this.textureArray) {
      return;
    }

    const instanceTiles: Array<TileCoord & { layer: number }> = [];

    for (const {
      tile,
      key,
      source,
      width: tileW,
      height: tileH,
    } of loadedTiles) {
      if (!this.isCurrentUpdate(generation) || signal.aborted) {
        return;
      }

      let layer = this.layerByTile.get(key);
      const needsUpload = layer === undefined || textureRecreated;

      if (layer === undefined) {
        layer = this.allocateLayer(key);
      }

      if (needsUpload) {
        this.uploadTileToLayer(layer, source, tileW, tileH);
      }

      instanceTiles.push({ ...tile, layer });
    }

    if (!this.isCurrentUpdate(generation) || !this.instanceBuffer) {
      return;
    }

    const instanceData = buildTileInstanceData(instanceTiles);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.instanceBuffer);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      instanceData,
      this.gl.DYNAMIC_DRAW,
    );
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);

    this.instanceCount = instanceTiles.length;
    this.activeTilesSignature = visibleTilesSignature(
      instanceTiles.map(({ x, y, z }) => ({ x, y, z })),
    );
    this.zoom = zoom;
    this.longitudeRange = longitudeRange;
    this.latitudeRange = latitudeRange;

    this.tileCache.evictUnused(neededKeys);
    this.requestRender();
  }

  getZoom(): number {
    return this.zoom;
  }

  /**
   * Requests a tile-set update for the current view.
   *
   * Fast successive calls abort the previous in-flight network work and only
   * the latest generation is allowed to mutate GPU state.
   */
  async update(
    zoom: number,
    longitudeRange: [number, number][],
    latitudeRange: [number, number][],
  ): Promise<void> {
    if (this.disposed) {
      throw new Error("Cannot update a disposed renderer");
    }

    if (
      zoom === this.zoom &&
      rangesEqual(longitudeRange, this.longitudeRange) &&
      rangesEqual(latitudeRange, this.latitudeRange)
    ) {
      return;
    }

    this.activeAbort?.abort();

    const abortController = new AbortController();
    this.activeAbort = abortController;

    const generation = ++this.updateGeneration;

    try {
      await this.updateTileData(
        zoom,
        longitudeRange,
        latitudeRange,
        generation,
        abortController.signal,
      );
    } catch (error) {
      if (isAbortError(error) || !this.isCurrentUpdate(generation)) {
        return;
      }

      throw error;
    } finally {
      if (this.activeAbort === abortController) {
        this.activeAbort = null;
      }
    }
  }

  draw(mvp: Float32Array): void {
    if (
      this.disposed ||
      !this.program ||
      !this.vao ||
      !this.textureArray ||
      !this.mvpLocation ||
      this.instanceCount === 0
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
    this.updateGeneration++;
    this.activeAbort?.abort();
    this.activeAbort = null;

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

    this.layerByTile.clear();
    this.tileByLayer = [];
    this.freeLayers = [];
    this.tileCache.clear();
    this.renderRequest = null;

    this.mvpLocation = null;
    this.instanceCount = 0;
    this.activeTilesSignature = "";
    this.textureCapacity = 0;
  }
}
