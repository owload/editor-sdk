/** What an extension supplies so the conformance suite can drive its editor. */
export interface ConformanceFixtures {
  /** A valid, small file of the format. */
  sample: Uint8Array;
  /**
   * Makes one change the way a user would (typing into the editing surface). Called several times
   * in one test: every call must change the document again. Wrap each gesture that React has to
   * render before the next one in `await act(async () => { ... })` (exported from this package).
   * Required, except for a `viewOnly` extension, which has nothing to edit.
   */
  edit?(container: HTMLElement): void | Promise<void>;
  /**
   * Called after the sample was edited once, saved, and the saved bytes were opened in a fresh
   * editor. Throw if the edit is not there.
   */
  verifyReopened?(container: HTMLElement): void | Promise<void>;
  /** True when the editor has finished loading. Default: the container has a child element. */
  ready?(container: HTMLElement): boolean;
  /** The element that has focus while the user types, for the save shortcut. Default: the active element. */
  focusTarget?(container: HTMLElement): HTMLElement | null;
  /** A file to draw a preview of, if different from `sample`. */
  previewSample?: Uint8Array;
  /** Performs "copy" inside the editor, if the format has a clipboard of its own. */
  copy?(container: HTMLElement): void | Promise<void>;
  /** The editor honours `readOnly`. */
  supportsReadOnly?: boolean;
  /** Longest wait for the editor to load, in ms. Default 5000. */
  timeoutMs?: number;
}
