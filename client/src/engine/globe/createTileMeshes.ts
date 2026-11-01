import {
  getLat,
  lonLatToPosition,
  tileXToLongitude,
  tileYToLatitude,
} from "../math/latlong";
import { EPSILON } from "../math/mat4";
import { TILE_SEGMENT } from "./type";

export type Mesh = {
  z: number;
  x: number;
  y: number;
  vertices: Float32Array;
  indices: Uint16Array;
};

/**
 * Generate the geometry for one geographic tile.
 */
export function createTileMesh(zoom: number, x: number, y: number): Mesh {
  const vertices: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= TILE_SEGMENT; row++) {
    const v = row / TILE_SEGMENT;
    const tileY = y + v;

    const latitude = tileYToLatitude(tileY, zoom);
    const latitudeRad = (latitude * Math.PI) / 180;

    for (let col = 0; col <= TILE_SEGMENT; col++) {
      const u = col / TILE_SEGMENT;
      const tileX = x + u;

      const longitude = tileXToLongitude(tileX, zoom);
      const longitudeRad = (longitude * Math.PI) / 180;

      // Convert longitude/latitude to a unit sphere position.
      const px = -Math.cos(longitudeRad) * Math.cos(latitudeRad);
      const py = Math.sin(latitudeRad);
      const pz = Math.sin(longitudeRad) * Math.cos(latitudeRad);

      // UV coordinates are local to this tile.
      vertices.push(px, py, pz, u, v);
    }
  }

  // Generate two triangles for each grid cell.
  for (let row = 0; row < TILE_SEGMENT; row++) {
    for (let col = 0; col < TILE_SEGMENT; col++) {
      const first = row * (TILE_SEGMENT + 1) + col;
      const second = first + TILE_SEGMENT + 1;

      indices.push(
        first,
        second,
        first + 1,

        second,
        second + 1,
        first + 1,
      );
    }
  }

  return {
    z: zoom,
    x,
    y,
    vertices: new Float32Array(vertices),
    indices: new Uint16Array(indices),
  };
}

/**
 * Generate all tile meshes intersecting a geographic range.
 *
 * longitudeRange: [west, east]
 * latitudeRange: [south, north]
 */
export function createTileMeshes(
  zoom: number,
  longitudeRange: [number, number],
  latitudeRange: [number, number],
): Mesh[] {
  const [west, east] = longitudeRange;

  const south = getLat(latitudeRange[0]);
  const north = getLat(latitudeRange[1]);

  const n = 2 ** zoom;

  const topLeft = lonLatToPosition(west, north, zoom);
  const bottomRight = lonLatToPosition(east - EPSILON, south + EPSILON, zoom);

  const meshes: Mesh[] = [];

  for (let y = topLeft.y; y <= bottomRight.y; y++) {
    for (let x = topLeft.x; x <= bottomRight.x; x++) {
      if (x < 0 || x >= n || y < 0 || y >= n) continue;

      meshes.push(createTileMesh(zoom, x, y));
    }
  }

  return meshes;
}
