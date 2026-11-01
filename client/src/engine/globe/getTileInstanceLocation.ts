import { getLat, lonLatToPosition } from "../math/latlong";
import { EPSILON } from "../math/mat4";

export function getTileInstanceLocation(
  zoom: number,
  longitudeRange: [number, number][],
  latitudeRange: [number, number][],
): Float32Array {
  const n = 2 ** zoom;

  const instanceData: number[] = [];
  const visitedTiles = new Set<string>();

  let textureLayer = 0;

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
          // Ignore tiles outside the valid XYZ tile range.
          if (x < 0 || x >= n || y < 0 || y >= n) {
            continue;
          }

          // Avoid duplicate tiles if geographic ranges overlap.
          const tileKey = `${zoom}/${x}/${y}`;

          if (visitedTiles.has(tileKey)) {
            continue;
          }

          visitedTiles.add(tileKey);

          // Store tile coordinates and corresponding texture layer.
          instanceData.push(x, y, zoom, textureLayer);

          textureLayer++;
        }
      }
    }
  }

  return new Float32Array(instanceData);
}
