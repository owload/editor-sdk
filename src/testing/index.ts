import { describe, it } from 'vitest';
import type { EditorExtension } from '../types';
import { checks } from './checks';
import type { ConformanceFixtures } from './fixtures';

export { checks } from './checks';
export type { Check } from './checks';
export type { ConformanceFixtures } from './fixtures';

/**
 * Registers the conformance tests of the editor contract (owload-docs/decisions/0019) for an
 * extension. Call it from a vitest file that runs in the `happy-dom` environment:
 *
 *   runConformanceTests(extension, { sample, edit, verifyReopened });
 */
export function runConformanceTests(extension: EditorExtension, fixtures: ConformanceFixtures): void {
  const timeout = (fixtures.timeoutMs ?? 5000) * 3;
  describe(`editor contract: ${extension.id}`, () => {
    for (const [name, check] of Object.entries(checks)) {
      it(name, () => check(extension, fixtures), timeout);
    }
  });
}
