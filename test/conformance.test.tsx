import { describe, expect, it } from 'vitest';
import { checks, runConformanceTests } from '../src/testing';
import { fixtures, referenceExtension, type Defect } from './reference-editor';

// The reference editor follows the contract, so every check passes for it.
runConformanceTests(referenceExtension(), fixtures);

const PREVIEW_OK = 'preview (when offered) returns a valid PNG within the size, or null, and leaves its input alone';

// Each defect breaks one rule, and the check named for that rule has to notice.
const CATCHES: [Defect, string][] = [
  ['fetch', 'makes no network, storage or cookie calls during a whole session'],
  ['storage', 'makes no network, storage or cookie calls during a whole session'],
  ['clipboard', 'with internalClipboardOnly nothing touches the system clipboard'],
  ['staysDirty', 'save() passes bytes to onSave and clears the dirty state'],
  ['cleanDuringPendingSave', 'an edit made while a save is pending keeps the document dirty'],
  ['swallowsFailure', 'a failing onSave keeps the document dirty and reports the error'],
  ['windowListener', 'leaves nothing behind after unmount'],
  ['callbackAfterUnmount', 'leaves nothing behind after unmount'],
  ['changesTitle', 'leaves nothing behind after unmount'],
  ['noShortcut', 'the save shortcut (Ctrl/Cmd+S) saves while the editor has focus'],
  ['dirtyOnOpen', 'opens a blank document for data = null'],
  ['previewTooBig', PREVIEW_OK],
  ['previewNotPng', PREVIEW_OK],
  ['previewTruncatedPng', PREVIEW_OK],
  ['previewMutatesInput', PREVIEW_OK],
  ['previewNetwork', 'preview (when offered) makes no network, storage or clipboard calls'],
  ['previewHangs', 'preview (when offered) ends in null or an error for garbage, without hanging'],
];

describe('the conformance checks catch broken editors', () => {
  it.each(CATCHES)('%s is caught by "%s"', async (defect, checkName) => {
    // A short wait keeps the "hangs" case quick.
    await expect(checks[checkName](referenceExtension(defect), { ...fixtures, timeoutMs: 400 })).rejects.toThrow();
  }, 20000);

  it('has a check for every name used above', () => {
    for (const [, name] of CATCHES) expect(checks[name]).toBeTypeOf('function');
  });

  it('catches an invalid descriptor', async () => {
    const bad = { ...referenceExtension(), id: 'Not Valid' };
    await expect(checks['has a valid descriptor and an editor component'](bad, fixtures)).rejects.toThrow();
  });
});
