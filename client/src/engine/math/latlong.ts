export const MAX_MERCATOR_LATITUDE = 85.05112878;
export function getLat(latitude: number) {
  return Math.max(
    -MAX_MERCATOR_LATITUDE,
    Math.min(MAX_MERCATOR_LATITUDE, latitude),
  );
}
export function lonLatToPosition(
  longitude: number,
  latitude: number,
  zoom: number,
) {
  const n = 2 ** zoom;

  const lat = getLat(latitude);

  const latRad = (lat * Math.PI) / 180;

  const x = Math.floor(((longitude + 180) / 360) * n);

  const y = Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n);

  return { x, y, z: zoom };
}

/**
 * Converts a unit sphere position into geographic coordinates.
 *
 * Matches the coordinate convention in VERTEX_SHADER_GLOBE.
 */
export function positionToLonLat(x: number, y: number, z: number) {
  return {
    longitude: Math.atan2(z, -x),
    latitude: Math.asin(Math.max(-1, Math.min(1, y))),
  };
}

export function tileYToLatitude(tileY: number, zoom: number): number {
  const n = 2 ** zoom;
  const mercatorY = Math.PI * (1 - (2 * tileY) / n);

  return Math.atan(Math.sinh(mercatorY)) * (180 / Math.PI);
}

export function tileXToLongitude(tileX: number, zoom: number): number {
  const n = 2 ** zoom;
  return (tileX / n) * 360 - 180;
}
