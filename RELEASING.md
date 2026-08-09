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

Publishing is intentionally manual. Dispatch the `release-sdk` workflow with
`publish=false` for a release rehearsal. The workflow refuses to publish a
version already present in the npm registry. The CLI remains a private
workspace tool and is never published.

## First release bootstrap

npm requires a package to exist before a trusted publisher can be configured.
Publish `0.1.0` once from an interactive npm session protected by account 2FA:

```bash
cd packages/sdk
npm login
npm publish --access public
```

After the first release, configure `@bencetotht/simplemailer` on npm with this
GitHub Actions trusted publisher:

- GitHub organization or user: `bencetotht`
- Repository: `simplemailer`
- Workflow filename: `release.yaml`
- Environment: leave empty
- Allowed action: `npm publish`

Then set the package publishing access to require 2FA and disallow traditional
tokens. Subsequent releases are published tokenlessly by dispatching the
`release-sdk` workflow with `publish=true`; no `NPM_TOKEN` secret is required.
