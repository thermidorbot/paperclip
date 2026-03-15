const TARGET_AVATAR_SIZE = 256;

function loadImageFromObjectUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to read image data"));
    image.src = url;
  });
}

export async function normalizeAvatarImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please select an image file");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromObjectUrl(objectUrl);
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    if (!Number.isFinite(sourceSize) || sourceSize <= 0) {
      throw new Error("Image has invalid dimensions");
    }

    const sx = Math.max(0, Math.floor((image.naturalWidth - sourceSize) / 2));
    const sy = Math.max(0, Math.floor((image.naturalHeight - sourceSize) / 2));
    const canvas = document.createElement("canvas");
    canvas.width = TARGET_AVATAR_SIZE;
    canvas.height = TARGET_AVATAR_SIZE;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to initialize image canvas");
    ctx.drawImage(image, sx, sy, sourceSize, sourceSize, 0, 0, TARGET_AVATAR_SIZE, TARGET_AVATAR_SIZE);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (!result) {
          reject(new Error("Failed to encode avatar image"));
          return;
        }
        resolve(result);
      }, "image/png");
    });

    return new File([blob], "avatar.png", { type: "image/png" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
