import { TILE_SEGMENT } from "./type";

export function createTileInstance(): {
  vertices: Float32Array;
  indices: Uint16Array;
} {
  const vertices: number[] = [];
  const indices: number[] = [];

  // Generate a shared grid.
  // Each vertex contains only its local UV coordinates: [u, v].
  for (let row = 0; row <= TILE_SEGMENT; row++) {
    const v = row / TILE_SEGMENT;

    for (let col = 0; col <= TILE_SEGMENT; col++) {
      const u = col / TILE_SEGMENT;

      vertices.push(u, v);
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
    vertices: new Float32Array(vertices),
    indices: new Uint16Array(indices),
  };
}
