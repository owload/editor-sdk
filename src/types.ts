import type { ComponentType, Ref } from 'react';

/** The version of the contract this package describes. A breaking change raises it. */
export const EDITOR_API_VERSION = 1 as const;

/** Imperative handle of an editor, available through the `ref` prop. */
export interface EditorHandle {
  /** Serializes the document and passes it to `onSave`. Resolves once `onSave` has finished. */
  save(): Promise<void>;
  /** True if there are changes that have not been passed to a successful `onSave` yet. */
  isDirty(): boolean;
}

/** What the host hands to an editor component. */
export interface EditorProps {
  /**
   * Contents of the file, decrypted by the host. `null` or empty starts a blank document.
   * Read once on mount and not kept afterwards; to open another file the host remounts the editor.
   */
  data: Uint8Array | null;
  /** Shown to the user only; the editor never reads or writes files by name. */
  fileName: string;
  /** Open for looking, not for editing. Optional: an editor that cannot do it ignores the flag. */
  readOnly?: boolean;
  /**
   * Set by the host. Copy, cut and paste must stay inside the editor: nothing is written to, or
   * read from, the system clipboard.
   */
  internalClipboardOnly?: boolean;
  /**
   * Called with the serialized file when the user saves (button or Ctrl/Cmd+S) or the host calls
   * `ref.save()`. If it throws or rejects, the document stays dirty and the error is shown and
   * reported through `onError`. The bytes belong to the host once the call is made.
   */
  onSave: (bytes: Uint8Array) => void | Promise<void>;
  /** Called whenever the "has unsaved changes" state flips. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Called when loading or saving fails (the editor also shows the message). */
  onError?: (error: Error) => void;
  className?: string;
  ref?: Ref<EditorHandle>;
}

export type EditorComponent = ComponentType<EditorProps>;

/** One thing that saving a file with this editor would drop. */
export interface UnsupportedFeature {
  /** Stable identifier, for tests and logs ("charts"). */
  id: string;
  /** Short English text the host shows as is ("Charts"). */
  label: string;
}

export interface PreviewOptions {
  /** The longest side of the image, in pixels, that the host will accept. */
  size: number;
}

export interface InspectResult {
  /** Empty when nothing would be lost. */
  unsupported: UnsupportedFeature[];
}

/** What an extension package exports (as `extension`). Build it with `defineExtension()`. */
export interface EditorExtension {
  apiVersion: typeof EDITOR_API_VERSION;
  /** Unique, lower case, letters, digits and dashes: "xlsx". */
  id: string;
  /** Singular noun for people: "Spreadsheet". */
  label: string;
  /** File extensions this editor opens: lower case, without the dot. */
  fileExtensions: string[];
  /** If present, the host offers a "New <label>" item that opens a blank document. */
  createNew?: {
    /** Lower case noun used in the menu: "New spreadsheet". */
    label: string;
    /** One of `fileExtensions`, added to the name when the user leaves it out. */
    defaultExtension: string;
  };
  /** The host refuses a bigger file before it decrypts it. Default: 100 MiB. */
  maxFileBytes?: number;
  /** Loads the editor lazily, so it is a separate chunk of the host's bundle. */
  load(): Promise<{ default: EditorComponent }>;
  /** Read-only look at a file: what saving it with this editor would lose. */
  inspect?(data: Uint8Array): Promise<InspectResult>;
  /**
   * Optional (owload-docs/decisions/0020): draws a preview of a file for the file grid. Returns the
   * bytes of a PNG whose longer side is at most `options.size`, or null when there is nothing to show
   * (an empty document, a file that cannot be read). It reads the file and changes nothing; the same
   * rules as for the editor apply. The host validates the result and gives up after PREVIEW_TIMEOUT_MS.
   */
  preview?(data: Uint8Array, options: PreviewOptions): Promise<Uint8Array | null>;
}
