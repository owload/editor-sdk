import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_FILE_BYTES, EDITOR_API_VERSION, ExtensionError, defineExtension, validateExtension } from '../src';

const valid = {
  apiVersion: EDITOR_API_VERSION,
  id: 'xlsx',
  label: 'Spreadsheet',
  fileExtensions: ['xlsx'],
  createNew: { label: 'spreadsheet', defaultExtension: 'xlsx' },
  maxFileBytes: 1024,
  load: async () => ({ default: () => null }),
};

describe('validateExtension', () => {
  it('accepts a complete descriptor and a minimal one', () => {
    expect(validateExtension(valid)).toEqual([]);
    expect(validateExtension({ apiVersion: 1, id: 'a', label: 'A', fileExtensions: ['a'], load: valid.load })).toEqual([]);
  });

  it('rejects things that are not descriptors', () => {
    expect(validateExtension(null)).not.toEqual([]);
    expect(validateExtension('xlsx')).not.toEqual([]);
  });

  it('rejects another apiVersion with one clear message instead of judging it by these rules', () => {
    const problems = validateExtension({ ...valid, apiVersion: 2, id: 'BAD' });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/Unsupported apiVersion 2/);
    expect(validateExtension({ ...valid, apiVersion: undefined })[0]).toMatch(/Unsupported apiVersion undefined/);
  });

  it.each([
    ['id', { id: 'Xlsx' }],
    ['id', { id: '1x' }],
    ['id', { id: 'x y' }],
    ['label', { label: '' }],
    ['label', { label: 'x'.repeat(41) }],
    ['fileExtensions', { fileExtensions: [] }],
    ['fileExtensions', { fileExtensions: ['.xlsx'] }],
    ['fileExtensions', { fileExtensions: ['XLSX'] }],
    ['fileExtensions', { fileExtensions: ['xlsx', 'xlsx'] }],
    ['createNew', { createNew: { label: 'x', defaultExtension: 'csv' } }],
    ['createNew', { createNew: { label: '', defaultExtension: 'xlsx' } }],
    ['maxFileBytes', { maxFileBytes: 0 }],
    ['maxFileBytes', { maxFileBytes: 1.5 }],
    ['load', { load: undefined }],
  ])('rejects a bad %s', (field, change) => {
    const problems = validateExtension({ ...valid, ...change });
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' ')).toContain(field);
  });
});

describe('defineExtension', () => {
  it('returns a valid descriptor unchanged', () => {
    expect(defineExtension(valid)).toBe(valid);
  });

  it('throws an ExtensionError naming the extension and every problem', () => {
    try {
      defineExtension({ ...valid, id: 'Bad', fileExtensions: [] } as never);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ExtensionError);
      expect((e as Error).message).toContain('"Bad"');
      expect((e as Error).message).toContain('id must');
      expect((e as Error).message).toContain('fileExtensions must');
    }
  });

  it('exports the default size limit', () => {
    expect(DEFAULT_MAX_FILE_BYTES).toBe(100 * 1024 * 1024);
  });
});
