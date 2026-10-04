import { act } from 'react';
import { expect } from 'vitest';
import type { EditorExtension } from '../types';
import { MAX_PREVIEW_BYTES, PREVIEW_TIMEOUT_MS, validatePreview } from '../preview';
import { validateExtension } from '../validate';
import type { ConformanceFixtures } from './fixtures';
import { trackListeners, watchForbiddenApis } from './guards';
import { edit, mount, settle, sleep } from './mount';

export type Check = (extension: EditorExtension, fixtures: ConformanceFixtures) => Promise<void>;

/** A promise that is settled by hand, to hold `onSave` pending. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

function expectNoError(onError: { mock: { calls: unknown[][] } }, when: string) {
  expect(onError.mock.calls.map((c) => String(c[0])), `onError was called ${when}`).toEqual([]);
}

/** The checks, in the order they run. Each throws if the extension breaks the rule it is named after. */
export const checks: Record<string, Check> = {
  'has a valid descriptor and an editor component': async (extension) => {
    expect(validateExtension(extension)).toEqual([]);
    const loaded = await extension.load();
    expect(loaded?.default, 'load() must resolve to { default: <component> }').toBeTruthy();
  },

  'opens a blank document for data = null': async (extension, fixtures) => {
    const m = await mount(extension, fixtures, { data: null });
    expectNoError(m.onError, 'for a blank document');
    expect(m.handle().isDirty(), 'a blank document is not dirty').toBe(false);
    expect(m.onDirtyChange.mock.calls.some((c) => c[0] === true), 'onDirtyChange(true) on mount').toBe(false);
    await m.unmount();
  },

  'opens the sample file without errors and clean': async (extension, fixtures) => {
    const m = await mount(extension, fixtures, { data: fixtures.sample });
    expectNoError(m.onError, 'for the sample file');
    expect(m.handle().isDirty()).toBe(false);
    expect(m.onDirtyChange.mock.calls.some((c) => c[0] === true)).toBe(false);
    expect(m.onSave).not.toHaveBeenCalled();
    await m.unmount();
  },

  'is dirty after an edit and says so': async (extension, fixtures) => {
    const m = await mount(extension, fixtures, { data: fixtures.sample });
    await edit(m, fixtures);
    expect(m.handle().isDirty(), 'isDirty() after an edit').toBe(true);
    expect(m.lastDirty(), 'last onDirtyChange value').toBe(true);
    await m.unmount();
  },

  'save() passes bytes to onSave and clears the dirty state': async (extension, fixtures) => {
    const m = await mount(extension, fixtures, { data: fixtures.sample });
    await edit(m, fixtures);
    await act(async () => { await m.handle().save(); });
    await settle();
    expect(m.onSave).toHaveBeenCalledTimes(1);
    const bytes = m.onSave.mock.calls[0][0];
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect((bytes as Uint8Array).byteLength).toBeGreaterThan(0);
    expect(m.handle().isDirty(), 'isDirty() after a successful save').toBe(false);
    expect(m.lastDirty(), 'last onDirtyChange value').toBe(false);
    expectNoError(m.onError, 'during a successful save');
    await m.unmount();
  },

  'the saved bytes reopen with the edit in them': async (extension, fixtures) => {
    const first = await mount(extension, fixtures, { data: fixtures.sample });
    await edit(first, fixtures);
    await act(async () => { await first.handle().save(); });
    const saved = first.onSave.mock.calls[0][0] as Uint8Array;
    await first.unmount();

    const second = await mount(extension, fixtures, { data: new Uint8Array(saved) });
    expectNoError(second.onError, 'when reopening the saved bytes');
    expect(second.handle().isDirty(), 'a reopened file is clean').toBe(false);
    await fixtures.verifyReopened?.(second.container);
    await second.unmount();
  },

  'a failing onSave keeps the document dirty and reports the error': async (extension, fixtures) => {
    const m = await mount(extension, fixtures, {
      data: fixtures.sample,
      onSave: async () => { throw new Error('upload failed'); },
    });
    await edit(m, fixtures);
    await act(async () => { await m.handle().save().catch(() => undefined); });
    await settle();
    expect(m.handle().isDirty(), 'isDirty() after a failed save').toBe(true);
    expect(m.onError, 'onError after a failed save').toHaveBeenCalled();
    await m.unmount();
  },

  'an edit made while a save is pending keeps the document dirty': async (extension, fixtures) => {
    const hold = deferred();
    const m = await mount(extension, fixtures, { data: fixtures.sample, onSave: () => hold.promise });
    await edit(m, fixtures);
    let saving!: Promise<void>;
    await act(async () => { saving = m.handle().save(); await sleep(20); });
    await edit(m, fixtures);
    await act(async () => { hold.resolve(); await saving.catch(() => undefined); });
    await settle();
    expect(m.handle().isDirty(), 'isDirty() after a save that did not include the last edit').toBe(true);
    await m.unmount();
  },

  'the save shortcut (Ctrl/Cmd+S) saves while the editor has focus': async (extension, fixtures) => {
    const m = await mount(extension, fixtures, { data: fixtures.sample });
    await edit(m, fixtures);
    const target = fixtures.focusTarget?.(m.container) ?? (document.activeElement as HTMLElement | null) ?? m.container;
    const event = new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true });
    await act(async () => { target.dispatchEvent(event); await sleep(20); });
    await settle();
    expect(m.onSave, 'onSave after Ctrl+S').toHaveBeenCalled();
    expect(event.defaultPrevented, 'the browser must not get Ctrl+S').toBe(true);
    await m.unmount();
  },

  'makes no network, storage or cookie calls during a whole session': async (extension, fixtures) => {
    const watch = watchForbiddenApis();
    try {
      const m = await mount(extension, fixtures, { data: fixtures.sample });
      await edit(m, fixtures);
      await act(async () => { await m.handle().save(); });
      await m.unmount();
      const fresh = await mount(extension, fixtures, { data: null });
      await fresh.unmount();
    } finally {
      watch.restore();
    }
    expect(watch.forbidden, 'forbidden calls').toEqual([]);
  },

  'with internalClipboardOnly nothing touches the system clipboard': async (extension, fixtures) => {
    const watch = watchForbiddenApis();
    try {
      const m = await mount(extension, fixtures, { data: fixtures.sample, internalClipboardOnly: true });
      await edit(m, fixtures);
      if (fixtures.copy) await act(async () => { await fixtures.copy!(m.container); });
      await settle();
      await m.unmount();
    } finally {
      watch.restore();
    }
    expect(watch.clipboard, 'clipboard calls').toEqual([]);
  },

  'readOnly does not make the document dirty (only when supportsReadOnly)': async (extension, fixtures) => {
    if (!fixtures.supportsReadOnly) return;
    const m = await mount(extension, fixtures, { data: fixtures.sample, readOnly: true });
    await edit(m, fixtures).catch(() => undefined);
    expect(m.handle().isDirty(), 'isDirty() in read-only mode').toBe(false);
    await m.unmount();
  },

  'preview (when offered) returns a valid PNG within the size, or null, and leaves its input alone': async (extension, fixtures) => {
    if (!extension.preview) return;
    const source = fixtures.previewSample ?? fixtures.sample;
    for (const size of [64, 360]) {
      const input = new Uint8Array(source);
      const result = await extension.preview(input, { size });
      expect([...input], 'preview() changed the bytes it was given').toEqual([...source]);
      if (result === null) continue;
      expect(validatePreview(result, size, MAX_PREVIEW_BYTES), `the preview at size ${size}`).toEqual([]);
    }
  },

  'preview (when offered) ends in null or an error for garbage, without hanging': async (extension, fixtures) => {
    if (!extension.preview) return;
    const limit = Math.min(PREVIEW_TIMEOUT_MS, fixtures.timeoutMs ?? 5000);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), limit); });
    try {
      const outcome = await Promise.race([
        extension.preview(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), { size: 64 }).then((r) => ({ r }), () => ({ r: null })),
        timeout,
      ]);
      expect(outcome, `preview() of garbage did not finish within ${limit} ms`).not.toBe('timeout');
      const { r } = outcome as { r: Uint8Array | null };
      if (r !== null) expect(validatePreview(r, 64), 'what preview() returned for garbage').toEqual([]);
    } finally {
      clearTimeout(timer);
    }
  },

  'preview (when offered) makes no network, storage or clipboard calls': async (extension, fixtures) => {
    if (!extension.preview) return;
    const watch = watchForbiddenApis();
    try {
      await extension.preview(new Uint8Array(fixtures.previewSample ?? fixtures.sample), { size: 64 }).catch(() => undefined);
    } finally {
      watch.restore();
    }
    expect(watch.forbidden, 'forbidden calls while drawing a preview').toEqual([]);
    expect(watch.clipboard, 'clipboard calls while drawing a preview').toEqual([]);
  },

  'leaves nothing behind after unmount': async (extension, fixtures) => {
    // What React itself leaves on the document is subtracted by mounting a plain element first.
    const { createRoot } = await import('react-dom/client');
    const tracker = trackListeners();
    const titleBefore = document.title;
    const bodyClass = document.body.className;
    const bodyStyle = document.body.getAttribute('style');
    let remaining: string[];
    let counts: number[];
    let after: number[];
    try {
      const probe = document.createElement('div');
      const probeRoot = createRoot(probe);
      await act(async () => { probeRoot.render(null); });
      await act(async () => { probeRoot.unmount(); });
      const reactOwn = new Set(tracker.remaining());

      const m = await mount(extension, fixtures, { data: fixtures.sample });
      await edit(m, fixtures);
      await m.unmount();
      remaining = tracker.remaining().filter((r) => !reactOwn.has(r));
      counts = [m.onSave.mock.calls.length, m.onDirtyChange.mock.calls.length, m.onError.mock.calls.length];
      await settle(120);
      after = [m.onSave.mock.calls.length, m.onDirtyChange.mock.calls.length, m.onError.mock.calls.length];
    } finally {
      tracker.restore();
    }
    expect(remaining, 'listeners on window/document left after unmount').toEqual([]);
    expect(after, 'callbacks called after unmount (onSave, onDirtyChange, onError)').toEqual(counts);
    expect(document.title, 'document.title').toBe(titleBefore);
    expect(document.body.className, 'body class').toBe(bodyClass);
    expect(document.body.getAttribute('style'), 'body style').toBe(bodyStyle);
  },
};
