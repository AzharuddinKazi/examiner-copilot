# Hardened picomatch replacement

This private, zero-dependency fork replaces **all** transitive picomatch copies
through the root pnpm override. It is not an official picomatch release.

## Why a local fork

As of 2026-11-18, [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
affects every published version, including the latest release. Neither updating
the parent packages nor the package manager's audit fix can remove the issue.

The runtime files and MIT license were copied unchanged from upstream picomatch
4.0.7, except for the documented security changes in `lib/parse.js` and
`lib/picomatch.js`. The API remains compatible with the micromatch, tinyglobby,
Vite, and Vitest consumers in this workspace.

## Security change

The single-branch repeated-extglob safeguard follows the approach proposed in
[upstream pull request 269](https://github.com/micromatch/picomatch/pull/269)
at commit `0a8fd459730fe42bcddc9cee69a56e19cc5f53de`:

- Collapse simple wildcard branches: repeating `*a` adds no matching power over
  one `*a`, but creates nested unbounded regex quantifiers.
- Detect wildcards from actual parser tokens, including unmatched brackets and
  `nobracket` mode, rather than independently guessing bracket syntax.
- Treat complex repeated wildcard branches as literal text, using upstream's
  existing conservative fallback. Capture/contains modes also use that fallback
  rather than changing iteration captures or match spans.
- Apply the guard even when `maxExtglobRecursion` is disabled.
- Reject recompiling collapsed parse states with capture/contains options.

Ordinary globs, literal repetitions, escaped stars and non-wildcard character
classes retain their existing semantics. Complex repeated wildcard extglobs
intentionally become literal matches; none are configured by the application.
This does not claim to make arbitrary regular expressions or every possible
glob safe for untrusted input.

## Verification and removal

Run `pnpm --filter @workspace/picomatch-safe test` for deadline-isolated attack
tests, matching checks and consumer compatibility tests. API tests and all
artifact builds must also pass when changing this replacement.

When an official patched version is published, replace this fork with compatible
upstream overrides, regenerate the lockfile and rerun the same checks. Do not
remove the override while either affected upstream release can be resolved.
