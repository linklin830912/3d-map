export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  return error instanceof Error && error.name === "AbortError";
}

export async function getOpenStreetMapTile(
  x: number,
  y: number,
  z: number,
  signal?: AbortSignal,
): Promise<ImageBitmap | null> {
  try {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const url = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

    const response = await fetch(url, { signal });

    if (!response.ok) {
      throw new Error(`Failed to load tile: ${response.status}`);
    }

    const blob = await response.blob();
    const image = await createImageBitmap(blob);

    return image;
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    return null;
  }
}
