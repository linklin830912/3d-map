export function getGlobeRadius(
  cameraDistance: number,
  canvasHeight: number,
  fovRadians: number,
): number {
  const focalLength = canvasHeight / (2 * Math.tan(fovRadians / 2));

  return focalLength / Math.sqrt(cameraDistance ** 2 - 1);
}
