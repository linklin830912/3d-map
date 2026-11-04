export type TileCoord = {
  x: number;
  y: number;
  z: number;
};

export type CachedTileImage = {
  source: HTMLCanvasElement | ImageBitmap;
  width: number;
  height: number;
  lastUsed: number;
};

export function tileKey(x: number, y: number, z: number): string {
  return `${z}/${x}/${y}`;
}

export function tileKeyFromCoord(tile: TileCoord): string {
  return tileKey(tile.x, tile.y, tile.z);
}

/**
 * CPU-side LRU cache for decoded tile images.
 *
 * Keeps ImageBitmap / canvas sources alive so pan/zoom can reuse them without
 * re-fetching from the network or re-running the debug overlay.
 */
export class TileImageCache {
  private readonly entries = new Map<string, CachedTileImage>();
  private readonly maxSize: number;

  constructor(maxSize = 256) {
    this.maxSize = Math.max(1, maxSize);
  }

  get size(): number {
    return this.entries.size;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  get(key: string): CachedTileImage | undefined {
    const entry = this.entries.get(key);

    if (!entry) {
      return undefined;
    }

    entry.lastUsed = performance.now();
    return entry;
  }

  set(
    key: string,
    source: HTMLCanvasElement | ImageBitmap,
    width: number,
    height: number,
  ): void {
    const existing = this.entries.get(key);

    if (existing && existing.source !== source) {
      closeTileSource(existing.source);
    }

    this.entries.set(key, {
      source,
      width,
      height,
      lastUsed: performance.now(),
    });

    this.evictIfNeeded();
  }

  /** Remove entries that are not in keepKeys until size <= maxSize. */
  evictUnused(keepKeys: Set<string>): void {
    if (this.entries.size <= this.maxSize) {
      return;
    }

    const candidates = [...this.entries.entries()]
      .filter(([key]) => !keepKeys.has(key))
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

    for (const [key, entry] of candidates) {
      if (this.entries.size <= this.maxSize) {
        break;
      }

      closeTileSource(entry.source);
      this.entries.delete(key);
    }
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      closeTileSource(entry.source);
    }

    this.entries.clear();
  }

  private evictIfNeeded(): void {
    if (this.entries.size <= this.maxSize) {
      return;
    }

    const sorted = [...this.entries.entries()].sort(
      (a, b) => a[1].lastUsed - b[1].lastUsed,
    );

    while (this.entries.size > this.maxSize && sorted.length > 0) {
      const oldest = sorted.shift();

      if (!oldest) {
        break;
      }

      const [key, entry] = oldest;
      closeTileSource(entry.source);
      this.entries.delete(key);
    }
  }
}

function closeTileSource(source: HTMLCanvasElement | ImageBitmap): void {
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    source.close();
  }
}
