import { EDITOR_API_VERSION, type EditorExtension } from './types';

const ID = /^[a-z][a-z0-9-]*$/;
const FILE_EXTENSION = /^[a-z0-9]+$/;
const MAX_LABEL = 40;

export const DEFAULT_MAX_FILE_BYTES = 100 * 1024 * 1024;

export class ExtensionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtensionError';
  }
}

/**
 * Checks a descriptor and returns the problems found (empty if it is valid). Takes `unknown` because
 * the host receives it from a package that may have been built against another version of this one.
 */
export function validateExtension(value: unknown): string[] {
  if (!value || typeof value !== 'object') return ['The descriptor is not an object.'];
  const ext = value as Partial<EditorExtension> & Record<string, unknown>;
  const problems: string[] = [];

  // A descriptor of another contract version cannot be judged by the rules of this one.
  if (ext.apiVersion !== EDITOR_API_VERSION) {
    return [`Unsupported apiVersion ${String(ext.apiVersion)}; this host supports ${EDITOR_API_VERSION}.`];
  }

  if (typeof ext.id !== 'string' || !ID.test(ext.id)) problems.push('id must be lower case letters, digits and dashes, starting with a letter.');
  if (typeof ext.label !== 'string' || !ext.label.trim() || ext.label.length > MAX_LABEL) problems.push(`label must be 1–${MAX_LABEL} characters.`);

  if (!Array.isArray(ext.fileExtensions) || ext.fileExtensions.length === 0) {
    problems.push('fileExtensions must be a non-empty array.');
  } else {
    if (ext.fileExtensions.some((e) => typeof e !== 'string' || !FILE_EXTENSION.test(e))) {
      problems.push('fileExtensions must be lower case, without the dot.');
    }
    if (new Set(ext.fileExtensions).size !== ext.fileExtensions.length) problems.push('fileExtensions has duplicates.');
  }

  if (ext.createNew !== undefined) {
    const c = ext.createNew;
    if (!c || typeof c.label !== 'string' || !c.label.trim() || c.label.length > MAX_LABEL) {
      problems.push(`createNew.label must be 1–${MAX_LABEL} characters.`);
    }
    if (!c || typeof c.defaultExtension !== 'string' || !Array.isArray(ext.fileExtensions) || !ext.fileExtensions.includes(c.defaultExtension)) {
      problems.push('createNew.defaultExtension must be one of fileExtensions.');
    }
  }

  if (ext.maxFileBytes !== undefined && (!Number.isSafeInteger(ext.maxFileBytes) || ext.maxFileBytes <= 0)) {
    problems.push('maxFileBytes must be a positive integer.');
  }
  if (typeof ext.load !== 'function') problems.push('load must be a function.');
  if (ext.preview !== undefined && typeof ext.preview !== 'function') problems.push('preview must be a function.');
  return problems;
}

/** Validates a descriptor at start-up and returns it; throws with every problem if it is not valid. */
export function defineExtension(extension: EditorExtension): EditorExtension {
  const problems = validateExtension(extension);
  if (problems.length > 0) {
    const id = typeof extension?.id === 'string' ? extension.id : '(unknown)';
    throw new ExtensionError(`Invalid editor extension "${id}": ${problems.join(' ')}`);
  }
  return extension;
}
