# @owload/editor-sdk

The contract between the Owload client and its **file-editor extensions** (a spreadsheet editor, a text
editor, …), as TypeScript types, a descriptor validator and a conformance test suite. It has no logic of
its own and no runtime dependency. The decision behind it is
[ADR 0019](https://github.com/owload/owload-docs/blob/main/decisions/0019-editor-extensions.md).

Each extension is its own package in its own repository. The host (`owload-front`) lists the extensions it
uses, decrypts a file, hands the bytes to the extension's editor, and receives the edited bytes back.

## Install

Until it is published to a registry, depend on a pinned release tag (or an exact commit) straight from
GitHub; the `prepare` script builds `dist/` on install:

```json
"@owload/editor-sdk": "github:owload/editor-sdk#v0.1.0"
```

Pin a tag or commit, never a branch, and review the diff on every bump. Needs Node 20 or newer.

## Writing an extension

1. Create a repository with a package that exports **two entries**:
   - `.` — the editor component (React 19);
   - `./extension` — the descriptor, kept tiny so the host can load it eagerly. The editor is loaded lazily
     through `load()` and becomes a separate chunk of the host.
   - If the package has styles, also export `./style.css`; the host imports it lazily together with the editor.
2. Write the component against `EditorProps` and forward `ref` as an `EditorHandle`.
3. Describe it:

   ```ts
   // src/extension.ts
   import { defineExtension } from '@owload/editor-sdk';

   export const extension = defineExtension({
     apiVersion: 1,
     id: 'text',                       // unique, lower case
     label: 'Text file',
     fileExtensions: ['txt'],          // lower case, no dot
     createNew: { label: 'text file', defaultExtension: 'txt' },
     maxFileBytes: 10 * 1024 * 1024,
     load: () => import('./editor').then((m) => ({ default: m.TextEditor })),
     // inspect: async (data) => ({ unsupported: [{ id: 'charts', label: 'Charts' }] }),
     // preview: async (data, { size }) => pngBytesOrNull,   // optional, see "Previews"
   });
   ```

4. Run the conformance suite in your tests (vitest, `environment: 'happy-dom'`):

   ```ts
   import { runConformanceTests } from '@owload/editor-sdk/testing';
   import { extension } from '../src/extension';

   runConformanceTests(extension, {
     sample: new TextEncoder().encode('hello'),
     edit: async (container) => { /* wrap each gesture in `await act(async () => ...)`, exported by this package; every call must change the document again */ },
     verifyReopened: (container) => { /* throw if the first edit is missing after save + reopen */ },
   });
   ```

## The contract

The host owns everything around the editor: the window and its close button, loading, the failed-load
message, the unsaved-changes dialog, the size check, decryption, the upload (always a `REPLACE`), the note
about lossy saving, file association and the "New …" menu items. The extension owns the editing surface only
and never shows its own close or "discard changes?" dialog.

| `EditorProps` | |
| --- | --- |
| `data` | The file, or `null`/empty for a blank document. Read once on mount, not kept. |
| `fileName` | Display only. |
| `readOnly?` | Optional capability. |
| `internalClipboardOnly?` | Set by the host: copy, cut and paste stay inside the editor. |
| `onSave(bytes)` | Called on Save / Ctrl+S / `ref.save()`. If it throws, the document stays dirty and the error is shown and passed to `onError`. The bytes belong to the host afterwards. |
| `onDirtyChange?` | Called when the unsaved-changes state flips. |
| `onError?` | Load or save failures. |
| `ref?` | `EditorHandle`: `save()` and `isDirty()`. |

### Previews (optional)

An extension may draw a preview of a file for the file grid
([ADR 0020](https://github.com/owload/owload-docs/blob/main/decisions/0020-extension-previews.md)):

```ts
preview?(data: Uint8Array, options: { size: number }): Promise<Uint8Array | null>
```

It returns the bytes of a **PNG** whose longer side is at most `size` pixels, or `null` when there is nothing to
show (an empty document, a file it cannot read). Like `inspect` it is lazy (load the drawing code with a dynamic
`import()`), has no React in it, reads the file and changes nothing, and follows the same rules as the editor (no
network, no browser storage, no clipboard). Drawing needs a canvas (`OffscreenCanvas`); where there is none, return
`null`. The host validates the result with `validatePreview()` — a complete PNG, at most `size` on its longer side,
at most `MAX_PREVIEW_BYTES` (2 MiB) — gives up after `PREVIEW_TIMEOUT_MS` (10 s), and never lets a failing preview
fail an upload or a save. The host asks for `THUMBNAIL_SIZE` (360).

### Rules every extension follows

- No network access; no `localStorage`, `sessionStorage`, IndexedDB or cookies; no logging of content.
- `data` is read once and not kept; the bytes given to `onSave` belong to the host from then on.
- `isDirty()` is true after an edit and false after a successful `onSave`; an edit made while a save is
  pending keeps it true; a failed `onSave` keeps it true.
- The save shortcut (Ctrl/Cmd+S) is handled by the editor while it has focus and its default is prevented.
- With `internalClipboardOnly` nothing is written to or read from the system clipboard.
- No callback after unmount; no listener left on `window` or `document`; no change to `document.title` or
  `<body>`.
- Styles are scoped to the extension's own class prefix (no global rules); a `.dark` ancestor switches the
  palette.
- `data = null` opens a blank document, so a new file needs no template: the host uploads what the first
  Save produces.

### What the conformance suite checks, and what it cannot

It drives the editor in `happy-dom` through the checks in `src/testing/checks.ts`: a valid descriptor; for an
extension with `preview`, a valid PNG within the size (or `null`), garbage input ending in `null` or an error
without hanging, and no network, storage or clipboard calls while it draws; a blank
document; opening the sample clean; dirty after an edit; save clears it; the saved bytes reopen with the edit;
a failing `onSave`; an edit during a pending save; the save shortcut; no calls to `fetch`, XHR, `WebSocket`,
`sendBeacon`, `indexedDB`, `localStorage`/`sessionStorage` or `document.cookie` during a whole session; no
system clipboard with `internalClipboardOnly`; read-only (if declared); and nothing left behind after unmount.
It catches the usual ways of breaking a rule. It cannot prove that an editor never finds another way, so
**review of the extension's diff stays the real check**: extensions run in the same page as the application and
see the plaintext of the user's files.

## Versioning

`EDITOR_API_VERSION` is the contract version. A breaking change raises it; the host refuses a descriptor whose
`apiVersion` it does not support (`validateExtension` reports it in one clear message).

## Development

```bash
npm install
npm test           # the suite's own tests: a reference editor plus one broken editor per rule
npm run lint
npm run typecheck
npm run build      # dist/
```
