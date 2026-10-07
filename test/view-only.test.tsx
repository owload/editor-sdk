import { describe, expect, it } from 'vitest';
import { defineExtension, validateExtension } from '../src';
import { checks, runConformanceTests } from '../src/testing';
import { referenceExtension, referenceViewer, viewerFixtures, type ViewerDefect } from './reference-editor';

// A view-only extension that follows the contract passes the whole suite without an edit() fixture.
runConformanceTests(referenceViewer(), viewerFixtures);

const NEVER_DIRTY = 'a view-only extension is never dirty and never saves (only when viewOnly)';

describe('view-only extensions', () => {
  it.each<ViewerDefect>(['dirties', 'saves'])('a viewer that %s is caught', async (defect) => {
    await expect(checks[NEVER_DIRTY](referenceViewer(defect), viewerFixtures)).rejects.toThrow();
  });

  it('the view-only check does nothing for an editor', async () => {
    await expect(checks[NEVER_DIRTY](referenceExtension(), viewerFixtures)).resolves.toBeUndefined();
  });

  it('an editor still needs its edit() fixture', async () => {
    await expect(checks['is dirty after an edit and says so'](referenceExtension(), { sample: viewerFixtures.sample })).rejects.toThrow(/edit\(\)/);
  });

  it('validates the flag', () => {
    expect(validateExtension(referenceViewer())).toEqual([]);
    expect(validateExtension({ ...referenceViewer(), viewOnly: 'yes' })).toEqual(['viewOnly must be true or false.']);
    expect(validateExtension({ ...referenceViewer(), createNew: { label: 'viewer file', defaultExtension: 'txt' } })).toEqual(['a viewOnly extension cannot have createNew.']);
    expect(() => defineExtension({ ...referenceViewer(), viewOnly: true, createNew: { label: 'x', defaultExtension: 'txt' } })).toThrow();
  });
});
