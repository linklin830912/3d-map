export async function getOpenStreetMapTile(
  x: number,
  y: number,
  z: number,
): Promise<ImageBitmap | null> {
  try {
    const url = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to load tile: ${response.status}`);
    }

    const blob = await response.blob();
    const image = await createImageBitmap(blob);

    return image;
  } catch (error) {
    return null;
  }
}
