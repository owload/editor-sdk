# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

`@owload/editor-sdk` — the contract between the Owload client (`owload-front`) and its file-editor extensions
(`@owload/xlsx-editor`, `@owload/text-editor`, …): types, a descriptor validator and a conformance test suite.
The decision is `owload-docs/decisions/0019-editor-extensions.md`; read `README.md` for the contract.

## Rules

- **Do not commit or push unless the owner explicitly asks** (each time; a past instruction does not carry over).
  Leave the work uncommitted and report.
- **English only** in code, comments, UI strings, docs and commit messages.
- Commit identity is `Owload <info@owload.com>` only — no `Co-Authored-By` or generated-by lines; pass it per
  commit: `git -c user.name=Owload -c user.email=info@owload.com commit ...`.
- **Before every push check the diff:** no sensitive data (secrets, tokens, keys, `.env` values, real hostnames or
  IPs, personal data, machine paths), and security does not get worse. Extensions see the plaintext of the user's
  files, so the contract and the conformance checks must not get weaker.
- No runtime dependencies. `react`, `react-dom` and `vitest` are peers (the last two optional).
- A change to the contract (`src/types.ts`, the rules in the README, the checks) is a change to every extension:
  write it up in `owload-docs` first, and raise `EDITOR_API_VERSION` for a breaking one.
- Every rule of the contract has a check and a test that a broken editor is caught. Add both together.

## Commands

```bash
npm test | npm run lint | npm run typecheck | npm run build
```

Use Node >= 20 (`.nvmrc` = 22). The default `node` on this machine may be older; `/opt/homebrew/bin/node` is newer.

## Layout

```
src/types.ts      the contract: EditorExtension, EditorProps, EditorHandle, EDITOR_API_VERSION
src/validate.ts   validateExtension(), defineExtension()
src/preview.ts    readPng(), validatePreview() and the preview limits, shared by the host and the suite
src/testing/      runConformanceTests(): checks.ts (the rules), guards.ts (forbidden APIs, listeners), mount.ts
test/             reference-editor.tsx (a good editor with one switchable defect each, also for preview), png.ts
                  (a tiny PNG encoder), the suite's own tests
```
