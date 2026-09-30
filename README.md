# fynjs-tests

Tests for the published [fynjs](https://github.com/jchip/fynjs) packages. Each test installs the package from the npm registry and exercises its public API or CLI.

## Layout

This is a fynpo monorepo. Each `packages/test-<name>` tests one published package.

## Run

```bash
fyn install
fyn run bootstrap
fyn run test
```

## CI

GitHub Actions runs on push to `main`, on pull requests, and daily at 4am PST. It tests Node.js 22.22.2, 24.15.0 and 26.

## License

Apache 2.0. See [LICENSE](LICENSE).
