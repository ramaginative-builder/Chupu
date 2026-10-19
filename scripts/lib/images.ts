import sharp from "sharp";
import heicConvert from "heic-convert";

export interface Processed {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  srcFormat: string;
  exifStripped: boolean;
}

export const FULL_MAX = 2000;
export const THUMB_MAX = 600;
export const WEBP_QUALITY = 80;

/**
 * HEIC/HEIF -> JPEG (browsers other than Safari can't show HEIC; sharp's prebuilt binaries only decode AVIF),
 * auto-rotate from EXIF, strip ALL metadata (sharp drops it unless withMetadata is called),
 * resize to max 2000px long edge + 600px thumbnail, WebP ~80%.
 */
export async function processImage(input: Buffer, ext: string): Promise<Processed> {
  const e = ext.toLowerCase().replace(".", "");
  let src = input;
  let srcFormat = e === "jpg" ? "jpeg" : e;
  if (e === "heic" || e === "heif") {
    const jpg = await heicConvert({ buffer: input, format: "JPEG", quality: 0.92 });
    src = Buffer.from(jpg as ArrayBuffer);
    srcFormat = "heic";
  }
  const base = () => sharp(src, { failOn: "none" }).rotate();
  const { data: full, info } = await base()
    .resize({ width: FULL_MAX, height: FULL_MAX, fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });
  const thumb = await base()
    .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  const meta = await sharp(full).metadata();
  return { full, thumb, width: info.width, height: info.height, srcFormat, exifStripped: !meta.exif && !meta.icc };
}
