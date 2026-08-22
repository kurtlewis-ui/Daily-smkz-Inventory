// Read an image File and return a downscaled data URL so photos stay small
// enough to store directly in the database (no external file storage).
//
// Goals:
// - Accept any input image size/dimensions.
// - Never crop: the aspect ratio is always preserved (the image is only scaled
//   down to fit within `maxSize`, never up).
// - Always compress the result to stay within `maxBytes`, lowering quality and,
//   if needed, dimensions, so the upload never fails because it is too large.

/** Approximate the decoded byte size of a data URL from its base64 payload. */
function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

export function fileToResizedDataUrl(
  file: File,
  maxSize = 512,
  quality = 0.85,
  maxBytes = 700_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not load the image.'));
      img.onload = () => {
        try {
          const srcW = img.naturalWidth || img.width;
          const srcH = img.naturalHeight || img.height;
          if (!srcW || !srcH) {
            reject(new Error('Could not load the image.'));
            return;
          }

          // Keep transparency for PNG/WebP/GIF sources; otherwise use JPEG.
          const supportsAlpha = /image\/(png|webp|gif)/.test(file.type);

          // Render the (possibly downscaled) image to a canvas at `targetMax`,
          // preserving aspect ratio. Returns a data URL.
          const render = (targetMax: number, q: number, forceJpeg: boolean): string => {
            // Only downscale, never upscale, and never crop.
            const scale = Math.min(1, targetMax / Math.max(srcW, srcH));
            const w = Math.max(1, Math.round(srcW * scale));
            const h = Math.max(1, Math.round(srcH * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('unsupported');
            const useJpeg = forceJpeg || !supportsAlpha;
            if (useJpeg) {
              // Flatten transparency onto white so it doesn't turn black.
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, w, h);
            }
            ctx.drawImage(img, 0, 0, w, h);
            return canvas.toDataURL(useJpeg ? 'image/jpeg' : 'image/png', q);
          };

          let curMax = Math.min(Math.max(srcW, srcH), maxSize);
          let q = quality;
          let forceJpeg = false;
          let best = render(curMax, q, forceJpeg);

          // If a transparent PNG is over budget, re-encode as JPEG for size.
          if (!forceJpeg && supportsAlpha && dataUrlBytes(best) > maxBytes) {
            forceJpeg = true;
            best = render(curMax, q, forceJpeg);
          }

          let attempts = 0;
          while (dataUrlBytes(best) > maxBytes && attempts < 12) {
            if (q > 0.5) {
              q = Math.max(0.5, q - 0.12);
            } else {
              curMax = Math.max(64, Math.round(curMax * 0.82));
            }
            forceJpeg = forceJpeg || !supportsAlpha;
            best = render(curMax, q, forceJpeg);
            attempts++;
          }

          resolve(best);
        } catch {
          reject(new Error('Image processing is not supported in this browser.'));
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
