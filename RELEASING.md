# Package releases

The public packages are versioned and released together:

- `@simplemailer/contracts`
- `@simplemailer/sdk`
- `@simplemailer/cli`

Before a release, update all three package versions and ensure the SDK and CLI
workspace dependency ranges still describe the intended compatible contracts.
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

`package:smoke` packs all three packages, installs the tarballs in a temporary
external consumer, verifies imports, and rejects unresolved `workspace:`
dependencies.

Publishing is intentionally manual. Dispatch the `release-packages` workflow
with `publish=false` for a release rehearsal. Use `publish=true` only after the
repository `NPM_TOKEN` secret is configured and the package versions have been
reviewed. The workflow refuses to publish a version already present in the npm
registry and publishes contracts, SDK, and CLI in dependency order.
