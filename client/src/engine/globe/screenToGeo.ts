import { FOV } from "../../const/camera";
import { MAX_MERCATOR_LATITUDE, positionToLonLat } from "../math/latlong";
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

export interface GeoBounds {
  longitudeRange: [number, number][];
  latitudeRange: [number, number][];
}

const EDGE_SAMPLES_PER_SIDE = 16;
const SILHOUETTE_SEGMENTS = 360;

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

  const length = Math.hypot(direction.x, direction.y, direction.z);

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
 * Assumes the rendering model matrix is Ry * Rx.
 */
export function inverseGlobeRotation(
  position: Vec3,
  rotationX: number,
  rotationY: number,
): Vec3 {
  const { x, y, z } = position;

  // Undo Y rotation (Ry^-1).
  const cosY = Math.cos(rotationY);
  const sinY = Math.sin(rotationY);

  const rotatedX = cosY * x - sinY * z;
  const rotatedZ = sinY * x + cosY * z;

  // Undo X rotation (Rx^-1).
  const cosX = Math.cos(rotationX);
  const sinX = Math.sin(rotationX);

  return {
    x: rotatedX,
    y: cosX * y + sinX * rotatedZ,
    z: -sinX * y + cosX * rotatedZ,
  };
}

/**
 * Projects a view-space point on the globe to NDC.
 *
 * Matches the camera used by GlobeCanvas: translate by -cameraDistance on Z,
 * then perspective with vertical FOV.
 */
export function projectWorldToNdc(
  position: Vec3,
  cameraDistance: number,
  canvasWidth: number,
  canvasHeight: number,
  fov: number,
): { ndcX: number; ndcY: number } | null {
  const cameraZ = position.z - cameraDistance;

  // Behind or beside the camera — not visible.
  if (cameraZ >= 0) {
    return null;
  }

  const tanHalfFov = Math.tan(fov / 2);
  const aspectRatio = canvasWidth / canvasHeight;

  return {
    ndcX: position.x / (-cameraZ * aspectRatio * tanHalfFov),
    ndcY: position.y / (-cameraZ * tanHalfFov),
  };
}

function isInsideNdc(ndcX: number, ndcY: number): boolean {
  return ndcX >= -1 && ndcX <= 1 && ndcY >= -1 && ndcY <= 1;
}

function viewPointToGeo(
  position: Vec3,
  rotationX: number,
  rotationY: number,
): GeoCoordinate {
  const { x, y, z } = inverseGlobeRotation(position, rotationX, rotationY);
  const coordinate = positionToLonLat(x, y, z);

  return {
    longitude: radiansToDegrees(coordinate.longitude),
    latitude: radiansToDegrees(coordinate.latitude),
  };
}

function appendEdgeSamples(
  coordinates: GeoCoordinate[],
  options: ScreenToGeoOptions,
): number {
  const { canvasWidth, canvasHeight, cameraDistance, rotationX, rotationY } =
    options;

  let hitCount = 0;
  const samples = EDGE_SAMPLES_PER_SIDE;

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;

    const edgePoints: [number, number][] = [
      [t * canvasWidth, 0],
      [t * canvasWidth, canvasHeight],
      [0, t * canvasHeight],
      [canvasWidth, t * canvasHeight],
    ];

    for (const [screenX, screenY] of edgePoints) {
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

      hitCount++;
      coordinates.push(viewPointToGeo(hit, rotationX, rotationY));
    }
  }

  return hitCount;
}

function appendCenterSample(
  coordinates: GeoCoordinate[],
  options: ScreenToGeoOptions,
): void {
  const { canvasWidth, canvasHeight, cameraDistance, rotationX, rotationY } =
    options;

  const ray = getScreenRay(
    canvasWidth / 2,
    canvasHeight / 2,
    canvasWidth,
    canvasHeight,
    FOV,
    cameraDistance,
  );

  const hit = intersectUnitSphere(ray.origin, ray.direction);

  if (!hit) {
    return;
  }

  coordinates.push(viewPointToGeo(hit, rotationX, rotationY));
}

/**
 * Adds limb points that project inside the canvas.
 *
 * Needed when the globe does not cover the full viewport: edge rays miss, but
 * the visible silhouette still defines the geographic coverage.
 */
function appendVisibleSilhouetteSamples(
  coordinates: GeoCoordinate[],
  options: ScreenToGeoOptions,
): void {
  const { canvasWidth, canvasHeight, cameraDistance, rotationX, rotationY } =
    options;

  if (cameraDistance <= 1) {
    throw new Error("Camera distance must be greater than 1");
  }

  const silhouetteZ = 1 / cameraDistance;
  const silhouetteRadius = Math.sqrt(1 - silhouetteZ * silhouetteZ);

  for (let i = 0; i < SILHOUETTE_SEGMENTS; i++) {
    const angle = (i / SILHOUETTE_SEGMENTS) * Math.PI * 2;

    const position: Vec3 = {
      x: silhouetteRadius * Math.cos(angle),
      y: silhouetteRadius * Math.sin(angle),
      z: silhouetteZ,
    };

    const ndc = projectWorldToNdc(
      position,
      cameraDistance,
      canvasWidth,
      canvasHeight,
      FOV,
    );

    if (!ndc || !isInsideNdc(ndc.ndcX, ndc.ndcY)) {
      continue;
    }

    coordinates.push(viewPointToGeo(position, rotationX, rotationY));
  }
}

/**
 * Calculates the geographic bounds of the entire visible hemisphere.
 *
 * Used when the globe fits entirely inside the canvas.
 */
export function getVisibleHemisphereBounds(
  cameraDistance: number,
  rotationX: number,
  rotationY: number,
  segments = SILHOUETTE_SEGMENTS,
): GeoBounds {
  if (cameraDistance <= 1) {
    throw new Error("Camera distance must be greater than 1");
  }

  const silhouetteZ = 1 / cameraDistance;
  const silhouetteRadius = Math.sqrt(1 - silhouetteZ * silhouetteZ);

  const coordinates: GeoCoordinate[] = [];

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;

    const position: Vec3 = {
      x: silhouetteRadius * Math.cos(angle),
      y: silhouetteRadius * Math.sin(angle),
      z: silhouetteZ,
    };

    coordinates.push(viewPointToGeo(position, rotationX, rotationY));
  }

  return getGeoBounds(coordinates);
}

/**
 * Converts unwrapped longitude interval [west, east] (east >= west, west in
 * [0, 360)) into one or two ranges in [-180, 180].
 */
function unwrappedLongitudeToRanges(
  west: number,
  east: number,
): [number, number][] {
  const span = east - west;

  if (span >= 360 - 1e-6) {
    return [[-180, 180]];
  }

  if (east <= 180) {
    return [[west, east]];
  }

  if (west >= 180) {
    const signedWest = west - 360;
    const signedEast = east - 360;

    if (signedEast <= 180) {
      return [[signedWest, signedEast]];
    }

    // Still crosses +180 after shifting (wide arc starting in [180, 360)).
    return [
      [signedWest, 180],
      [-180, signedEast - 360],
    ];
  }

  // west < 180 < east
  if (east <= 360) {
    return [
      [west, 180],
      [-180, east - 360],
    ];
  }

  // east > 360 and west < 180: arc crossed the antimeridian and more.
  const signedEast = east - 360;

  if (signedEast >= west) {
    return [[-180, 180]];
  }

  return [
    [west, 180],
    [-180, signedEast],
  ];
}

/**
 * Converts geographic sample points into longitude and latitude ranges.
 *
 * Longitude is circular, so the smallest containing interval is calculated by
 * finding the largest gap between sorted longitudes. The interval is split at
 * the antimeridian when necessary.
 */
export function getGeoBounds(coordinates: GeoCoordinate[]): GeoBounds {
  if (coordinates.length === 0) {
    throw new Error("Cannot calculate geographic bounds without coordinates");
  }

  const latitudes = coordinates.map(({ latitude }) => latitude);

  const south = Math.max(MAX_MERCATOR_LATITUDE * -1, Math.min(...latitudes));
  const north = Math.min(MAX_MERCATOR_LATITUDE, Math.max(...latitudes));

  const longitudes = coordinates
    .map(({ longitude }) => ((longitude % 360) + 360) % 360)
    .sort((a, b) => a - b);

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

  const startIndex = (largestGapIndex + 1) % longitudes.length;
  const west = longitudes[startIndex];
  let east = longitudes[largestGapIndex];

  if (east < west) {
    east += 360;
  }

  return {
    longitudeRange: unwrappedLongitudeToRanges(west, east),
    latitudeRange: [[south, north]],
  };
}

/**
 * Estimates the geographic bounds covered by the current canvas view.
 *
 * Strategy:
 * 1. Cast rays through densely sampled canvas edges (and the center).
 * 2. Also include globe silhouette points that project inside the canvas —
 *    required when the globe does not fill the viewport and edge rays miss.
 * 3. Convert the hit / limb samples into lon/lat ranges for tile selection.
 */
export function screenToGeo(options: ScreenToGeoOptions): GeoBounds | null {
  const { cameraDistance } = options;

  if (cameraDistance <= 1) {
    return null;
  }

  const coordinates: GeoCoordinate[] = [];

  appendEdgeSamples(coordinates, options);
  appendCenterSample(coordinates, options);
  appendVisibleSilhouetteSamples(coordinates, options);

  if (coordinates.length === 0) {
    return getVisibleHemisphereBounds(
      cameraDistance,
      options.rotationX,
      options.rotationY,
    );
  }

  return getGeoBounds(coordinates);
}
