import { act, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { EditorExtension, EditorProps } from '../src';
import { defineExtension } from '../src';

/**
 * A minimal editor that follows the contract, with switches that break exactly one rule each.
 * It is the "good" editor of the suite's own tests and the base of the "bad" ones.
 */
export type Defect =
  | 'fetch'
  | 'storage'
  | 'clipboard'
  | 'staysDirty'
  | 'cleanDuringPendingSave'
  | 'swallowsFailure'
  | 'windowListener'
  | 'callbackAfterUnmount'
  | 'noShortcut'
  | 'changesTitle'
  | 'dirtyOnOpen';

function createEditor(defect?: Defect) {
  return function Editor({ data, onSave, onDirtyChange, onError, internalClipboardOnly, ref }: EditorProps) {
    const [initial] = useState(() => (data && data.byteLength ? new TextDecoder().decode(data) : ''));
    const [text, setText] = useState(initial);
    const [error, setError] = useState<string | null>(null);
    const textRef = useRef(initial);
    const savedRef = useRef(initial);
    const dirtyRef = useRef(defect === 'dirtyOnOpen');
    const mountedRef = useRef(true);
    const onDirtyRef = useRef(onDirtyChange);
    onDirtyRef.current = onDirtyChange;

    const setDirty = (value: boolean) => {
      if (!mountedRef.current && defect !== 'callbackAfterUnmount') return;
      if (dirtyRef.current === value) return;
      dirtyRef.current = value;
      onDirtyRef.current?.(value);
    };

    useEffect(() => {
      mountedRef.current = true;
      if (defect === 'dirtyOnOpen') onDirtyRef.current?.(true);
      if (defect === 'changesTitle') document.title = 'edited';
      if (defect === 'windowListener') window.addEventListener('resize', () => undefined);
      return () => {
        mountedRef.current = false;
        if (defect === 'callbackAfterUnmount') setTimeout(() => onDirtyRef.current?.(false), 50);
      };
    }, []);

    const save = async () => {
      const snapshot = textRef.current;
      try {
        await onSave(new TextEncoder().encode(snapshot));
        if (defect === 'storage') window.localStorage.setItem('draft', snapshot);
        savedRef.current = snapshot;
        if (defect === 'staysDirty') return;
        if (defect === 'cleanDuringPendingSave') setDirty(false);
        else setDirty(textRef.current !== savedRef.current);
      } catch (e) {
        if (defect === 'swallowsFailure') { setDirty(false); return; }
        const error = e instanceof Error ? e : new Error(String(e));
        setError(error.message);
        onError?.(error);
      }
    };
    const saveRef = useRef(save);
    saveRef.current = save;

    useImperativeHandle(ref, () => ({ save: () => saveRef.current(), isDirty: () => dirtyRef.current }), []);

    return (
      <div>
        {error && <p role="alert">{error}</p>}
        <textarea
          value={text}
          onChange={(e) => {
            const value = e.target.value;
            textRef.current = value;
            setText(value);
            setDirty(value !== savedRef.current);
            if (defect === 'fetch') fetch('http://localhost:1/leak', { method: 'POST', body: value }).catch(() => undefined);
            if (defect === 'clipboard' && internalClipboardOnly) navigator.clipboard.writeText(value).catch(() => undefined);
          }}
          onKeyDown={(e) => {
            if (defect === 'noShortcut') return;
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
              e.preventDefault();
              void saveRef.current();
            }
          }}
        />
      </div>
    );
  };
}

export function referenceExtension(defect?: Defect, overrides: Partial<EditorExtension> = {}): EditorExtension {
  return defineExtension({
    apiVersion: 1,
    id: 'reference',
    label: 'Reference text',
    fileExtensions: ['txt'],
    createNew: { label: 'reference file', defaultExtension: 'txt' },
    load: async () => ({ default: createEditor(defect) }),
    ...overrides,
  });
}

export const fixtures = {
  sample: new TextEncoder().encode('hello'),
  async edit(container: HTMLElement) {
    const textarea = container.querySelector('textarea')!;
    await act(async () => {
      textarea.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(textarea, textarea.value + '!');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
  },
  verifyReopened(container: HTMLElement) {
    const value = container.querySelector('textarea')!.value;
    if (value !== 'hello!') throw new Error(`The reopened document holds "${value}", not "hello!".`);
  },
  ready: (container: HTMLElement) => !!container.querySelector('textarea'),
  focusTarget: (container: HTMLElement) => container.querySelector('textarea'),
  supportsReadOnly: false,
};
