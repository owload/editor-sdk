/**
 * Watches for the things an editor extension must not do (decision 0019, point 6):
 * reach the network, use the browser's storage, touch the system clipboard, or leave
 * listeners behind. It records calls; it cannot prove that an editor never finds another way,
 * so review stays the real check.
 */

type Restore = () => void;

function patchProperty(target: object, key: string, value: unknown, restores: Restore[]): void {
  const original = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, writable: true, enumerable: original?.enumerable ?? true, value });
  restores.push(() => {
    if (original) Object.defineProperty(target, key, original);
    else delete (target as Record<string, unknown>)[key];
  });
}

function patchAccessor(target: object, key: string, record: () => void, restores: Restore[]): void {
  const original = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, {
    configurable: true,
    get() { record(); return undefined; },
    set() { record(); },
  });
  restores.push(() => {
    if (original) Object.defineProperty(target, key, original);
    else delete (target as Record<string, unknown>)[key];
  });
}

export interface Watch {
  /** Network and storage calls seen so far. */
  forbidden: string[];
  /** Clipboard calls seen so far. */
  clipboard: string[];
  restore(): void;
}

export function watchForbiddenApis(): Watch {
  const restores: Restore[] = [];
  const forbidden: string[] = [];
  const clipboard: string[] = [];
  const g = globalThis as unknown as Record<string, unknown>;

  const recorder = (name: string, list: string[]) => () => { list.push(name); throw new Error(`${name} is not allowed in an editor extension.`); };

  if (typeof g.fetch === 'function') patchProperty(globalThis, 'fetch', recorder('fetch', forbidden), restores);
  if (typeof XMLHttpRequest !== 'undefined') {
    patchProperty(XMLHttpRequest.prototype, 'open', recorder('XMLHttpRequest', forbidden), restores);
    patchProperty(XMLHttpRequest.prototype, 'send', recorder('XMLHttpRequest', forbidden), restores);
  }
  for (const name of ['WebSocket', 'EventSource', 'WebTransport']) {
    if (typeof g[name] === 'function') patchProperty(globalThis, name, function () { recorder(name, forbidden)(); }, restores);
  }
  if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
    patchProperty(navigator, 'sendBeacon', recorder('navigator.sendBeacon', forbidden), restores);
  }
  // Any access to the storage objects counts: the objects themselves are replaced, because
  // an environment may implement them as proxies that ignore patches of their methods.
  for (const name of ['localStorage', 'sessionStorage']) {
    if (name in g) patchAccessor(globalThis, name, () => { forbidden.push(`web storage (${name})`); throw new Error(`${name} is not allowed in an editor extension.`); }, restores);
  }
  if (typeof indexedDB !== 'undefined') {
    patchProperty(indexedDB, 'open', recorder('indexedDB.open', forbidden), restores);
  }
  if (typeof document !== 'undefined') {
    patchAccessor(document, 'cookie', () => forbidden.push('document.cookie'), restores);
  }

  if (typeof navigator !== 'undefined') {
    const fake: Record<string, () => Promise<never>> = {};
    for (const method of ['writeText', 'readText', 'write', 'read']) {
      fake[method] = () => { clipboard.push(`navigator.clipboard.${method}`); return Promise.reject(new Error('The system clipboard is not allowed.')); };
    }
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: fake });
    restores.push(() => { delete (navigator as unknown as Record<string, unknown>).clipboard; });
  }
  if (typeof document !== 'undefined') {
    for (const command of ['execCommand']) {
      patchProperty(document, command, (name: string) => { clipboard.push(`document.execCommand(${name})`); return false; }, restores);
    }
  }

  return { forbidden, clipboard, restore: () => restores.reverse().forEach((r) => r()) };
}

export interface ListenerTracker {
  /** Event types still listened for on window/document that were added since tracking began. */
  remaining(): string[];
  restore(): void;
}

/** Tracks addEventListener/removeEventListener on window and document. */
export function trackListeners(): ListenerTracker {
  const restores: Restore[] = [];
  const live = new Map<string, number>();
  const key = (target: object, type: string, listener: unknown, capture: boolean) =>
    `${target === window ? 'window' : 'document'}\u0000${type}\u0000${capture}\u0000${listenerId(listener)}`;

  const ids = new WeakMap<object, number>();
  let nextId = 1;
  function listenerId(listener: unknown): number {
    if (!listener || (typeof listener !== 'object' && typeof listener !== 'function')) return 0;
    let id = ids.get(listener as object);
    if (id === undefined) { id = nextId++; ids.set(listener as object, id); }
    return id;
  }
  const captureOf = (options: unknown) => (typeof options === 'boolean' ? options : !!(options as { capture?: boolean } | undefined)?.capture);

  for (const target of [window, document] as const) {
    const add = target.addEventListener.bind(target) as (...a: unknown[]) => void;
    const remove = target.removeEventListener.bind(target) as (...a: unknown[]) => void;
    patchProperty(target, 'addEventListener', (type: string, listener: unknown, options?: unknown) => {
      const k = key(target, type, listener, captureOf(options));
      const once = typeof options === 'object' && options !== null && (options as { once?: boolean }).once;
      if (!once) live.set(k, 1);
      add(type, listener, options);
    }, restores);
    patchProperty(target, 'removeEventListener', (type: string, listener: unknown, options?: unknown) => {
      live.delete(key(target, type, listener, captureOf(options)));
      remove(type, listener, options);
    }, restores);
  }

  return {
    remaining: () => [...live.keys()].map((k) => k.split('\u0000').slice(0, 2).join(' ')),
    restore: () => restores.reverse().forEach((r) => r()),
  };
}
