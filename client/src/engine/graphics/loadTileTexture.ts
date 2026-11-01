import { getOpenStreetMapTile } from "../api/tile";

export async function loadTileTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  textureLayer: number,
  x: number,
  y: number,
  z: number,
): Promise<void> {
  let image: ImageBitmap | null = null;

  try {
    image = await getOpenStreetMapTile(x, y, z);

    if (!image) return;

    // Add the XYZ debug label to the tile.
    const debugImage = await addTileDebugOverlay(image, x, y, z);

    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);

    // Upload the labeled tile into its assigned texture-array layer.
    gl.texSubImage3D(
      gl.TEXTURE_2D_ARRAY,
      0, // mip level
      0, // x offset
      0, // y offset
      textureLayer, // z offset: texture-array layer
      debugImage.width, // width
      debugImage.height, // height
      1, // depth: one layer
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      debugImage,
    );
  } catch (error) {
    console.error(`Failed to load tile ${z}/${x}/${y}:`, error);
  } finally {
    image?.close();
  }
}

export async function addTileDebugOverlay(
  image: ImageBitmap,
  x: number,
  y: number,
  z: number,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");

  canvas.width = image.width;
  canvas.height = image.height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Failed to create 2D canvas context");
  }

  // Draw the original tile.
  context.drawImage(image, 0, 0);

  // Draw a magenta border.
  context.strokeStyle = "#ff00ff";
  context.lineWidth = 3;
  context.strokeRect(1.5, 1.5, canvas.width - 3, canvas.height - 3);

  // Prepare the tile coordinate label.
  const label = `${x}/${y}/${z}`;

  context.font = "bold 20px monospace";

  const padding = 8;
  const textWidth = context.measureText(label).width;
  const boxWidth = textWidth + padding * 2;
  const boxHeight = 36;

  // Draw the label background.
  context.fillStyle = "rgba(0, 0, 0, 0.8)";
  context.fillRect(8, 8, boxWidth, boxHeight);

  // Draw the coordinates.
  context.fillStyle = "#00ff66";
  context.textBaseline = "middle";
  context.fillText(label, 8 + padding, 8 + boxHeight / 2);

  return canvas;
}
