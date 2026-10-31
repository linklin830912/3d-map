import { getOpenStreetMapTile } from "../api/tile";

export async function loadTileTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  x: number,
  y: number,
  z: number,
): Promise<void> {
  try {
    const image = await getOpenStreetMapTile(x, y, z);

    if (!image) return;

    gl.bindTexture(gl.TEXTURE_2D, texture);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    image.close();
  } catch (error) {
    console.error("Failed to load tile texture:", error);
  }
}
