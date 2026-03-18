export function isHeicFile(file: File): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type === "image/heic" ||
    type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

export async function convertHeicToJpeg(file: File, quality = 0.85): Promise<File> {
  const { default: convert } = await import("heic-convert");

  const buffer = new Uint8Array(await file.arrayBuffer());

  const jpegBuffer = await convert({
    buffer,
    format: "JPEG",
    quality,
  });

  const blob = new Blob([jpegBuffer], { type: "image/jpeg" });
  const newName = file.name.replace(/\.heic$/i, ".jpg").replace(/\.heif$/i, ".jpg");
  return new File([blob], newName, { type: "image/jpeg" });
}
