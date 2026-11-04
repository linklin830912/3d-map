import { getLat, lonLatToPosition } from "../math/latlong";
import { EPSILON } from "../math/mat4";
import { tileKey, type TileCoord } from "./tileCache";

/**
 * Returns the unique XYZ tiles that cover the given geographic ranges.
 */
export function getVisibleTiles(
  zoom: number,
  longitudeRange: [number, number][],
  latitudeRange: [number, number][],
): TileCoord[] {
  const n = 2 ** zoom;

  const tiles: TileCoord[] = [];
  const visitedTiles = new Set<string>();

  for (const [west, east] of longitudeRange) {
    for (const [southValue, northValue] of latitudeRange) {
      const south = getLat(southValue);
      const north = getLat(northValue);

      const topLeft = lonLatToPosition(west, north, zoom);

      const bottomRight = lonLatToPosition(
        east - EPSILON,
        south + EPSILON,
        zoom,
      );

      for (let y = topLeft.y; y <= bottomRight.y; y++) {
        for (let x = topLeft.x; x <= bottomRight.x; x++) {
          if (x < 0 || x >= n || y < 0 || y >= n) {
            continue;
          }

          const key = tileKey(x, y, zoom);

          if (visitedTiles.has(key)) {
            continue;
          }

          visitedTiles.add(key);
          tiles.push({ x, y, z: zoom });
        }
      }
    }
  }

  return tiles;
}

/**
 * Builds instanced attribute data: [x, y, z, textureLayer] per tile.
 */
export function buildTileInstanceData(
  tiles: Array<TileCoord & { layer: number }>,
): Float32Array {
  const instanceData = new Float32Array(tiles.length * 4);

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const offset = i * 4;

    instanceData[offset] = tile.x;
    instanceData[offset + 1] = tile.y;
    instanceData[offset + 2] = tile.z;
    instanceData[offset + 3] = tile.layer;
  }

  return instanceData;
}
