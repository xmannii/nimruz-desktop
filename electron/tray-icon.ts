import { nativeImage, type NativeImage } from "electron";

const MACOS_TRAY_SIZE = 18;
const DEFAULT_TRAY_SIZE = 20;
const MACOS_SCALE_FACTOR = 2;
const LOGO_EDGE_PADDING_RATIO = 0.06;

type PixelBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function findLogoBounds(image: NativeImage): PixelBounds | null {
  const { width, height } = image.getSize();
  const bitmap = image.toBitmap();
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = bitmap[offset + 3] ?? 0;
      const average =
        ((bitmap[offset] ?? 255) +
          (bitmap[offset + 1] ?? 255) +
          (bitmap[offset + 2] ?? 255)) /
        3;
      const visibleDarkness = (255 - average) * (alpha / 255);
      if (visibleDarkness < 8) continue;

      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) return null;

  const logoWidth = right - left + 1;
  const logoHeight = bottom - top + 1;
  const padding = Math.ceil(
    Math.max(logoWidth, logoHeight) * LOGO_EDGE_PADDING_RATIO
  );
  const size = Math.min(
    Math.max(logoWidth, logoHeight) + padding * 2,
    width,
    height
  );
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;

  return {
    x: Math.max(0, Math.min(width - size, Math.round(centerX - size / 2))),
    y: Math.max(0, Math.min(height - size, Math.round(centerY - size / 2))),
    width: size,
    height: size,
  };
}

function applyTransparentLogoMask(
  bitmap: Buffer,
  platform: NodeJS.Platform
) {
  for (let offset = 0; offset < bitmap.length; offset += 4) {
    const sourceAlpha = bitmap[offset + 3] ?? 0;
    const average =
      ((bitmap[offset] ?? 255) +
        (bitmap[offset + 1] ?? 255) +
        (bitmap[offset + 2] ?? 255)) /
      3;
    const alpha = Math.round((255 - average) * (sourceAlpha / 255));

    if (platform === "darwin") {
      bitmap[offset] = 0;
      bitmap[offset + 1] = 0;
      bitmap[offset + 2] = 0;
    } else {
      // NativeImage bitmaps use BGRA on Windows. A swapped channel order on
      // another platform still yields a visible brand-colored logo.
      bitmap[offset] = Math.round(6 * (alpha / 255));
      bitmap[offset + 1] = Math.round(119 * (alpha / 255));
      bitmap[offset + 2] = Math.round(217 * (alpha / 255));
    }
    bitmap[offset + 3] = alpha;
  }
}

/**
 * Turns the full app icon into a compact, transparent system-tray mark.
 *
 * The app icon intentionally has an opaque white canvas. Passing it directly
 * to macOS as a template image makes that whole canvas a solid rectangle, so
 * the canvas must become alpha before the image is marked as a template.
 */
export function createTrayIcon(
  source: NativeImage,
  platform: NodeJS.Platform = process.platform
) {
  const bounds = findLogoBounds(source);
  const cropped = bounds ? source.crop(bounds) : source;
  const logicalSize = platform === "darwin" ? MACOS_TRAY_SIZE : DEFAULT_TRAY_SIZE;
  const scaleFactor = platform === "darwin" ? MACOS_SCALE_FACTOR : 1;
  const pixelSize = logicalSize * scaleFactor;
  const resized = cropped.resize({
    width: pixelSize,
    height: pixelSize,
    quality: "best",
  });
  const bitmap = resized.toBitmap();
  applyTransparentLogoMask(bitmap, platform);

  const trayIcon = nativeImage.createFromBitmap(bitmap, {
    width: pixelSize,
    height: pixelSize,
    scaleFactor,
  });
  if (platform === "darwin") trayIcon.setTemplateImage(true);
  return trayIcon;
}
