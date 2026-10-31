import { getLat, lonLatToTile } from "../math/latlong";
import { EPSILON } from "../math/mat4";

export function getTileInstanceLocation(
  zoom: number,
  longitudeRange: [number, number],
  latitudeRange: [number, number],
): Float32Array {
  const [west, east] = longitudeRange;

  const south = getLat(latitudeRange[0]);
  const north = getLat(latitudeRange[1]);

  const n = 2 ** zoom;

  const topLeft = lonLatToTile(west, north, zoom);
  const bottomRight = lonLatToTile(east - EPSILON, south + EPSILON, zoom);

  const instanceData: number[] = [];

  let textureLayer = 0;

  for (let y = topLeft.y; y <= bottomRight.y; y++) {
    for (let x = topLeft.x; x <= bottomRight.x; x++) {
      // Ignore tiles outside the valid XYZ tile range.
      if (x < 0 || x >= n || y < 0 || y >= n) {
        continue;
      }

      // Store the geographic tile identity and texture layer.
      instanceData.push(x, y, zoom, textureLayer);

      textureLayer++;
    }
  }

  return new Float32Array(instanceData);
}
