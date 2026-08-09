# SDK releases

The only public npm package is:

- `@bencetotht/simplemailer`

Before a release, update the SDK package version.
Run the complete local verification:

```bash
pnpm db:generate
pnpm --filter dashboard openapi:generate
pnpm lint
pnpm type-check
pnpm test
pnpm build
pnpm package:smoke
```

`package:smoke` packs the SDK, installs the tarball in a temporary
external consumer, verifies imports, and rejects unresolved `workspace:`
dependencies.

Publishing is intentionally manual. Dispatch the `release-sdk` workflow
with `publish=false` for a release rehearsal. Use `publish=true` only after the
repository `NPM_TOKEN` secret is configured and the SDK version has been
reviewed. The workflow refuses to publish a version already present in the npm
registry and publishes the SDK. The CLI remains a private workspace tool and is
never published.
