/** A minimal PNG encoder for the tests (stored deflate blocks, no compression, no dependency). */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const x of bytes) {
    a = (a + x) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A width×height RGB image filled with one color. */
export function encodePng(width: number, height: number, rgb: [number, number, number] = [200, 200, 200]): Uint8Array {
  const row = new Uint8Array(1 + width * 3);
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3);
  const raw = new Uint8Array(row.length * height);
  for (let y = 0; y < height; y++) raw.set(row, y * row.length);

  const blocks: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  for (let i = 0; i < raw.length || i === 0; i += 65535) {
    const part = raw.subarray(i, Math.min(i + 65535, raw.length));
    const last = i + 65535 >= raw.length;
    const head = new Uint8Array(5);
    head[0] = last ? 1 : 0;
    head[1] = part.length & 0xff;
    head[2] = part.length >> 8;
    head[3] = ~part.length & 0xff;
    head[4] = (~part.length >> 8) & 0xff;
    blocks.push(head, part);
  }
  const sum = new Uint8Array(4);
  new DataView(sum.buffer).setUint32(0, adler32(raw));
  blocks.push(sum);
  const idat = new Uint8Array(blocks.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const b of blocks) { idat.set(b, at); at += b.length; }

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array())];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  at = 0;
  for (const p of parts) { png.set(p, at); at += p.length; }
  return png;
}
