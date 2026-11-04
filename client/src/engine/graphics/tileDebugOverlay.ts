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

  context.drawImage(image, 0, 0);

  context.strokeStyle = "#ff00ff";
  context.lineWidth = 3;
  context.strokeRect(1.5, 1.5, canvas.width - 3, canvas.height - 3);

  const label = `${x}/${y}/${z}`;

  context.font = "bold 20px monospace";

  const padding = 8;
  const textWidth = context.measureText(label).width;
  const boxWidth = textWidth + padding * 2;
  const boxHeight = 36;

  context.fillStyle = "rgba(0, 0, 0, 0.8)";
  context.fillRect(8, 8, boxWidth, boxHeight);

  context.fillStyle = "#00ff66";
  context.textBaseline = "middle";
  context.fillText(label, 8 + padding, 8 + boxHeight / 2);

  return canvas;
}
