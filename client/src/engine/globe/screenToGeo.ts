import { FOV } from "../../const/camera";
import { positionToLonLat } from "../math/latlong";
import { radiansToDegrees } from "../math/mat4";

export type Vec3 = { x: number; y: number; z: number };

export interface GeoCoordinate {
  longitude: number;
  latitude: number;
}

export interface ScreenToGeoOptions {
  canvasWidth: number;
  canvasHeight: number;
  cameraDistance: number;
  rotationX: number;
  rotationY: number;
}

export interface ScreenRay {
  origin: Vec3;
  direction: Vec3;
}

/**
 * Calculates the projected radius of a unit sphere in pixels.
 *
 * Assumptions:
 * - Sphere radius is 1.
 * - Camera looks directly at the sphere center.
 * - Camera distance is measured from the sphere center.
 * - Perspective projection is used.
 */
export function getGlobeRadius(
  cameraDistance: number,
  canvasHeight: number,
  fov: number,
): number {
  if (cameraDistance <= 1) {
    throw new Error("Camera distance must be greater than sphere radius");
  }

  const focalLength = canvasHeight / (2 * Math.tan(fov / 2));

  return focalLength / Math.sqrt(cameraDistance ** 2 - 1);
}

/**
 * Converts a canvas pixel coordinate into a camera ray.
 *
 * Assumes:
 * - Camera position is (0, 0, cameraDistance).
 * - Camera looks along negative Z.
 * - Camera has no rotation.
 */
export function getScreenRay(
  screenX: number,
  screenY: number,
  canvasWidth: number,
  canvasHeight: number,
  fov: number,
  cameraDistance: number,
): ScreenRay {
  const aspectRatio = canvasWidth / canvasHeight;

  const ndcX = (screenX / canvasWidth) * 2 - 1;
  const ndcY = 1 - (screenY / canvasHeight) * 2;

  const tanHalfFov = Math.tan(fov / 2);

  const direction: Vec3 = {
    x: ndcX * aspectRatio * tanHalfFov,
    y: ndcY * tanHalfFov,
    z: -1,
  };

  const length = Math.hypot(...[direction.x, direction.y, direction.z]);

  const normalizedDirection: Vec3 = {
    x: direction.x / length,
    y: direction.y / length,
    z: direction.z / length,
  };

  return {
    origin: { x: 0, y: 0, z: cameraDistance },
    direction: normalizedDirection,
  };
}

/**
 * Finds the nearest intersection between a ray and a unit sphere.
 *
 * Returns null if the ray does not hit the sphere.
 */
export function intersectUnitSphere(
  origin: Vec3,
  direction: Vec3,
): Vec3 | null {
  const b =
    2 *
    (origin.x * direction.x + origin.y * direction.y + origin.z * direction.z);

  const c = origin.x ** 2 + origin.y ** 2 + origin.z ** 2 - 1;

  const discriminant = b * b - 4 * c;

  if (discriminant < 0) {
    return null;
  }

  const t = (-b - Math.sqrt(discriminant)) / 2;

  if (t < 0) {
    return null;
  }

  return {
    x: origin.x + t * direction.x,
    y: origin.y + t * direction.y,
    z: origin.z + t * direction.z,
  };
}

/**
 * Applies inverse Y rotation, followed by inverse X rotation.
 *
 * Assumes the rendering rotation order is X followed by Y.
 */
export function inverseGlobeRotation(
  position: Vec3,
  rotationX: number,
  rotationY: number,
): Vec3 {
  const { x, y, z } = position;

  // Undo Y rotation.
  const cosY = Math.cos(rotationY);
  const sinY = Math.sin(rotationY);

  const rotatedX = cosY * x - sinY * z;
  const rotatedZ = sinY * x + cosY * z;

  // Undo X rotation.
  const cosX = Math.cos(rotationX);
  const sinX = Math.sin(rotationX);

  return {
    x: rotatedX,
    y: cosX * y + sinX * rotatedZ,
    z: -sinX * y + cosX * rotatedZ,
  };
}

/**
 * Converts a canvas pixel coordinate into geographic coordinates.
 *
 * Returns null if the screen position does not intersect the globe.
 *
 * All screen coordinates are relative to the canvas top-left corner.
 */
export interface GeoBounds {
  longitudeRange: [number, number][];
  latitudeRange: [number, number][];
}

export interface GeoBounds {
  longitudeRange: [number, number][];
  latitudeRange: [number, number][];
}

export function screenToGeo(options: ScreenToGeoOptions): GeoBounds | null {
  const { canvasWidth, canvasHeight, cameraDistance, rotationX, rotationY } =
    options;

  const screenPositions: [number, number][] = [
    // Four corners
    [0, 0],
    [canvasWidth, 0],
    [0, canvasHeight],
    [canvasWidth, canvasHeight],

    // Four edge midpoints
    [canvasWidth / 2, 0],
    [canvasWidth / 2, canvasHeight],
    [0, canvasHeight / 2],
    [canvasWidth, canvasHeight / 2],
  ];

  const coordinates: GeoCoordinate[] = [];

  for (const [screenX, screenY] of screenPositions) {
    const ray = getScreenRay(
      screenX,
      screenY,
      canvasWidth,
      canvasHeight,
      FOV,
      cameraDistance,
    );

    const hit = intersectUnitSphere(ray.origin, ray.direction);

    if (!hit) {
      continue;
    }

    const { x, y, z } = inverseGlobeRotation(hit, rotationX, rotationY);

    const coordinate = positionToLonLat(x, y, z);

    coordinates.push({
      longitude: radiansToDegrees(coordinate.longitude),
      latitude: radiansToDegrees(coordinate.latitude),
    });
  }

  if (coordinates.length === 0) {
    return getVisibleHemisphereBounds(cameraDistance, rotationX, rotationY);
  }

  return getGeoBounds(coordinates);
}

/**
 * Calculates the geographic bounds of the entire visible hemisphere.
 *
 * Used when the globe fits entirely inside the canvas and
 * none of the sampled canvas-edge positions intersects it.
 */
export function getVisibleHemisphereBounds(
  cameraDistance: number,
  rotationX: number,
  rotationY: number,
  segments = 360,
): GeoBounds {
  if (cameraDistance <= 1) {
    throw new Error("Camera distance must be greater than 1");
  }

  const silhouetteZ = 1 / cameraDistance;

  const silhouetteRadius = Math.sqrt(1 - silhouetteZ * silhouetteZ);

  const coordinates: GeoCoordinate[] = [];

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;

    // A point on the sphere's projected silhouette.
    const position: Vec3 = {
      x: silhouetteRadius * Math.cos(angle),
      y: silhouetteRadius * Math.sin(angle),
      z: silhouetteZ,
    };

    // Convert from rendered orientation to geographic orientation.
    const { x, y, z } = inverseGlobeRotation(position, rotationX, rotationY);

    const coordinate = positionToLonLat(x, y, z);

    coordinates.push({
      longitude: radiansToDegrees(coordinate.longitude),
      latitude: radiansToDegrees(coordinate.latitude),
    });
  }

  return getGeoBounds(coordinates);
}

/**
 * Converts geographic coordinates into longitude and latitude ranges.
 *
 * Longitude is circular, so the smallest containing interval is
 * calculated by finding the largest gap between sorted longitudes.
 * The resulting interval is split at the antimeridian when necessary.
 */
function getGeoBounds(coordinates: GeoCoordinate[]): GeoBounds {
  if (coordinates.length === 0) {
    throw new Error("Cannot calculate geographic bounds without coordinates");
  }

  // Calculate latitude bounds.
  const latitudes = coordinates.map(({ latitude }) => latitude);

  const south = Math.max(-85.05112878, Math.min(...latitudes));

  const north = Math.min(85.05112878, Math.max(...latitudes));

  // Convert longitudes to [0, 360) and sort them.
  const longitudes = coordinates
    .map(({ longitude }) => ((longitude % 360) + 360) % 360)
    .sort((a, b) => a - b);

  // Find the largest gap between consecutive longitudes.
  let largestGap = -1;
  let largestGapIndex = -1;

  for (let i = 0; i < longitudes.length; i++) {
    const current = longitudes[i];

    const next =
      i === longitudes.length - 1 ? longitudes[0] + 360 : longitudes[i + 1];

    const gap = next - current;

    if (gap > largestGap) {
      largestGap = gap;
      largestGapIndex = i;
    }
  }

  // The smallest containing interval is outside the largest gap.
  const startIndex = (largestGapIndex + 1) % longitudes.length;

  const west = longitudes[startIndex];
  let east = longitudes[largestGapIndex];

  if (east < west) {
    east += 360;
  }

  // Split the longitude interval at the antimeridian.
  let longitudeRange: [number, number][];

  if (east <= 180) {
    longitudeRange = [[west, east]];
  } else if (west >= 180) {
    longitudeRange = [[west - 360, east - 360]];
  } else {
    longitudeRange = [
      [west, 180],
      [-180, east - 360],
    ];
  }

  return {
    longitudeRange,
    latitudeRange: [[south, north]],
  };
}
