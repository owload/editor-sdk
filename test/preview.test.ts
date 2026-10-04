import { describe, expect, it } from 'vitest';
import { MAX_PREVIEW_BYTES, readPng, validatePreview, validateExtension } from '../src';
import { encodePng } from './png';
import { referenceExtension } from './reference-editor';

describe('readPng', () => {
  it('reads the size of a complete PNG', () => {
    expect(readPng(encodePng(40, 30))).toEqual({ width: 40, height: 30 });
    expect(readPng(encodePng(1, 1))).toEqual({ width: 1, height: 1 });
  });

  it('refuses things that are not a complete PNG', () => {
    const good = encodePng(10, 10);
    expect(readPng(new Uint8Array())).toBeNull();
    expect(readPng(new TextEncoder().encode('GIF89a'.padEnd(80, ' ')))).toBeNull();
    expect(readPng(good.subarray(0, good.length - 1))).toBeNull(); // no IEND
    expect(readPng(good.subarray(0, 30))).toBeNull(); // truncated
    const wrongType = good.slice();
    wrongType[12] = 0x58; // IHDR -> XHDR
    expect(readPng(wrongType)).toBeNull();
    const zero = good.slice();
    new DataView(zero.buffer).setUint32(16, 0);
    expect(readPng(zero)).toBeNull();
    const huge = good.slice();
    new DataView(huge.buffer).setUint32(16, 100_000);
    expect(readPng(huge)).toBeNull();
    const badDepth = good.slice();
    badDepth[24] = 7;
    expect(readPng(badDepth)).toBeNull();
  });

  it('reads a PNG that is a view into a larger buffer', () => {
    const png = encodePng(12, 9);
    const padded = new Uint8Array(png.length + 5);
    padded.set(png, 5);
    expect(readPng(padded.subarray(5))).toEqual({ width: 12, height: 9 });
  });
});

describe('validatePreview', () => {
  it('accepts a PNG within the size and the byte limit', () => {
    expect(validatePreview(encodePng(360, 200), 360)).toEqual([]);
  });

  it('refuses something that is not bytes', () => {
    expect(validatePreview('png', 360)).toHaveLength(1);
    expect(validatePreview(null, 360)).toHaveLength(1);
    expect(validatePreview(new ArrayBuffer(10), 360)).toHaveLength(1);
  });

  it('refuses a PNG with a side over the size, and says by how much', () => {
    expect(validatePreview(encodePng(400, 100), 360)[0]).toMatch(/400×100.*at most 360/);
    expect(validatePreview(encodePng(100, 400), 360)).toHaveLength(1);
  });

  it('refuses a preview over the byte limit', () => {
    expect(validatePreview(encodePng(200, 200), 360, 100)[0]).toMatch(/bytes; the limit is 100/);
    expect(MAX_PREVIEW_BYTES).toBe(2 * 1024 * 1024);
  });
});

describe('the descriptor', () => {
  it('accepts a preview function and refuses anything else', () => {
    expect(validateExtension(referenceExtension())).toEqual([]);
    expect(validateExtension({ ...referenceExtension(), preview: 'yes' }).join(' ')).toContain('preview');
  });
});
