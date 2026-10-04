/**
 * Previews (owload-docs/decisions/0020): an extension may return a PNG of a file. The host does not trust it,
 * and the conformance suite uses the same checks, so both live here.
 */

/** The largest PNG, in bytes, the host accepts as a preview. */
export const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;
/** How long the host waits for `preview()` before treating it as "no preview", in ms. */
export const PREVIEW_TIMEOUT_MS = 10_000;
/** The size of the thumbnail the file grid shows, in pixels (the longer side). */
export const THUMBNAIL_SIZE = 360;

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const IEND = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
const BIT_DEPTHS = new Set([1, 2, 4, 8, 16]);
const COLOR_TYPES = new Set([0, 2, 3, 4, 6]);
const MAX_SIDE = 16_384;

export interface PngInfo {
  width: number;
  height: number;
}

/** Reads the dimensions of a complete PNG (signature, IHDR, closing IEND); null if it is not one. */
export function readPng(bytes: Uint8Array): PngInfo | null {
  if (bytes.length < 8 + 25 + IEND.length) return null;
  if (!SIGNATURE.every((b, i) => bytes[i] === b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (view.getUint32(8) !== 13 || type !== 'IHDR') return null;
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE) return null;
  if (!BIT_DEPTHS.has(bytes[24]) || !COLOR_TYPES.has(bytes[25])) return null;
  const tail = bytes.length - IEND.length;
  if (!IEND.every((b, i) => bytes[tail + i] === b)) return null;
  return { width, height };
}

/**
 * Checks what `preview()` returned: a PNG, at most `size` pixels on its longer side and at most
 * `maxBytes` large. Returns the problems found (empty if it is acceptable).
 */
export function validatePreview(value: unknown, size: number, maxBytes: number = MAX_PREVIEW_BYTES): string[] {
  if (!(value instanceof Uint8Array)) return ['The preview must be a Uint8Array of PNG bytes.'];
  if (value.byteLength > maxBytes) return [`The preview is ${value.byteLength} bytes; the limit is ${maxBytes}.`];
  const png = readPng(value);
  if (!png) return ['The preview is not a valid PNG.'];
  if (Math.max(png.width, png.height) > size) {
    return [`The preview is ${png.width}×${png.height}; its longer side must be at most ${size}.`];
  }
  return [];
}
