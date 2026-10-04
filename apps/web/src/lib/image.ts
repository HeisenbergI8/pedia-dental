/**
 * Downscales to at most `maxSide` px on the long side and re-encodes as JPEG, so a 4 MB phone photo is
 * stored as roughly 200–400 KB (1600 px, clinical photos) or ~40 KB (512 px, the child's profile photo).
 */
export async function compressImage(file: File, maxSide = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read this image"))), "image/jpeg", 0.82),
  );
}
