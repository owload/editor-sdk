import { act, createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { vi } from 'vitest';
import type { EditorComponent, EditorExtension, EditorHandle, EditorProps } from '../types';
import type { ConformanceFixtures } from './fixtures';

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Lets pending promises, timers and React updates settle. */
export async function settle(ms = 30): Promise<void> {
  await act(async () => { await sleep(ms); });
}

export async function waitFor(condition: () => boolean, what: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}.`);
    await settle(20);
  }
}

export interface Mounted {
  container: HTMLElement;
  handle: () => EditorHandle;
  onSave: ReturnType<typeof vi.fn>;
  onDirtyChange: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
  unmount(): Promise<void>;
  /** True after the last `onDirtyChange` call said so. */
  lastDirty(): boolean | undefined;
}

export interface MountOptions {
  data: Uint8Array | null;
  readOnly?: boolean;
  internalClipboardOnly?: boolean;
  onSave?: EditorProps['onSave'];
}

(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

export async function loadComponent(extension: EditorExtension): Promise<EditorComponent> {
  const loaded = await extension.load();
  if (!loaded || !loaded.default) throw new Error('load() must resolve to { default: <editor component> }.');
  return loaded.default;
}

export async function mount(
  extension: EditorExtension,
  fixtures: ConformanceFixtures,
  options: MountOptions,
): Promise<Mounted> {
  const Component = await loadComponent(extension);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const ref = createRef<EditorHandle>();
  const onSave = vi.fn(options.onSave ?? (async () => {}));
  const onDirtyChange = vi.fn();
  const onError = vi.fn();
  const timeout = fixtures.timeoutMs ?? 5000;

  await act(async () => {
    root.render(createElement(Component, {
      data: options.data,
      fileName: `sample.${extension.fileExtensions[0]}`,
      readOnly: options.readOnly,
      internalClipboardOnly: options.internalClipboardOnly,
      onSave,
      onDirtyChange,
      onError,
      ref,
    }));
  });
  const ready = fixtures.ready ?? ((c: HTMLElement) => c.childElementCount > 0);
  await waitFor(() => ready(container), 'the editor to be ready', timeout);
  await settle();

  let unmounted = false;
  return {
    container,
    handle: () => {
      if (!ref.current) throw new Error('The ref of the editor is not set: forward it with useImperativeHandle.');
      return ref.current;
    },
    onSave,
    onDirtyChange,
    onError,
    lastDirty: () => {
      const calls = onDirtyChange.mock.calls;
      return calls.length ? (calls[calls.length - 1][0] as boolean) : undefined;
    },
    async unmount() {
      if (unmounted) return;
      unmounted = true;
      await act(async () => { root.unmount(); });
      container.remove();
    },
  };
}

/** Makes one user edit through the extension's own fixture. */
export async function edit(mounted: Mounted, fixtures: ConformanceFixtures): Promise<void> {
  await fixtures.edit(mounted.container);
  await settle();
}
