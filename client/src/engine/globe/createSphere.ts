export function createSphere(
  latitudeSegments: number,
  longitudeSegments: number,
) {
  const vertices: number[] = [];
  const indices: number[] = [];

  for (let lat = 0; lat <= latitudeSegments; lat++) {
    const theta = (lat / latitudeSegments) * Math.PI;

    for (let lon = 0; lon <= longitudeSegments; lon++) {
      const phi = (lon / longitudeSegments) * Math.PI * 2;

      const x = -Math.cos(phi) * Math.sin(theta);
      const y = Math.cos(theta);
      const z = Math.sin(phi) * Math.sin(theta);

      const u = lon / longitudeSegments;
      const v = 1 - lat / latitudeSegments;

      vertices.push(x, y, z, u, v);
    }
  }

  for (let lat = 0; lat < latitudeSegments; lat++) {
    for (let lon = 0; lon < longitudeSegments; lon++) {
      const first = lat * (longitudeSegments + 1) + lon;
      const second = first + longitudeSegments + 1;

      indices.push(first, second, first + 1, second, second + 1, first + 1);
    }
  }

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint16Array(indices),
  };
}
