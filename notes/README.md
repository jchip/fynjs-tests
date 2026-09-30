# fynjs-tests

A fynpo monorepo that tests the published packages of `../fynjs` from the npm registry.

- `packages/test-<name>`: one package per published fynjs package, exercising its public API or CLI.
- CI runs on Node 22.22.2, 24.15.0 and 26.
- Run everything with `fyn install`, `fyn run bootstrap` (fynpo bootstrap), then `fyn run test`.
- AI planning docs go in `notes/`, stale ones in `notes/archive`.

## Deferred

- create-fynpo harness: `@fynjs/create-monorepo` is private and unpublished (npm `create-fynpo` 1.0.3 is the stale pre-rename package). Revisit once it is published.
