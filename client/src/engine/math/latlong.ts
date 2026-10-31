export const MAX_MERCATOR_LATITUDE = 85.05112878;
export function getLat(latitude: number) {
  return Math.max(
    -MAX_MERCATOR_LATITUDE,
    Math.min(MAX_MERCATOR_LATITUDE, latitude),
  );
}
export function lonLatToTile(
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

export function tileYToLatitude(tileY: number, zoom: number): number {
  const n = 2 ** zoom;
  const mercatorY = Math.PI * (1 - (2 * tileY) / n);

  return Math.atan(Math.sinh(mercatorY)) * (180 / Math.PI);
}

export function tileXToLongitude(tileX: number, zoom: number): number {
  const n = 2 ** zoom;
  return (tileX / n) * 360 - 180;
}
