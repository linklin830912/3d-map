import { createGpuResources } from "../graphics/createGpuResources";
import { createGpuTexture } from "../graphics/createGpuTexture";
import { loadTileTexture } from "../graphics/loadTileTexture";
import { createTileMeshes } from "./createTileMeshes";
import type { GpuTile } from "./type";

export async function renderTileMeshes(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  zoom: number,
  longitudeRange: [number, number],
  latitudeRange: [number, number],
): Promise<GpuTile[]> {
  const meshes = createTileMeshes(zoom, longitudeRange, latitudeRange);
  // const textureArray = createTileTextureArray(gl, tiles.length);

  const tiles = await Promise.all(
    meshes.map(async (mesh): Promise<GpuTile> => {
      const geometry = createGpuResources(gl, program, mesh);
      const texture = createGpuTexture(gl);

      await loadTileTexture(gl, texture, mesh.x, mesh.y, mesh.z);

      return {
        geometry,
        texture,
        x: mesh.x,
        y: mesh.y,
        z: mesh.z,
      };
    }),
  );

  return tiles;
}
