# Releases

## Deployable components

Every non-release push to `main` runs `.github/workflows/cd.yaml`. The workflow compares the pushed commits with the previous revision, runs `scripts/bump-versions.mjs`, commits only affected version files back to `main`, and then publishes:

- `ghcr.io/bencetotht/simplemailer-dashboard:<semver>` for dashboard changes and changes to its shared database/SDK dependencies;
- `ghcr.io/bencetotht/simplemailer-worker:<semver>` for worker changes and changes to its database dependency;
- `oci://ghcr.io/bencetotht/charts/simplemailer` for chart changes or an image version update.

Each artifact also gets a component-scoped GitHub release (`dashboard-vX.Y.Z`, `worker-vX.Y.Z`, or `helm-vX.Y.Z`) with generated release notes. Conventional commit `feat:` changes bump the minor version, `BREAKING CHANGE` or `type!:` changes bump the major version, and all other changes bump the patch version. A chart-only change never bumps or rebuilds an application image.

The repository must allow GitHub Actions to write repository contents and packages. If `main` is protected, permit the GitHub Actions bot to push the version commit. GHCR packages inherit the repository/package visibility policy; mark each package public in its package settings after its first publication if it is not public automatically.

Validate release selection locally with:

```bash
pnpm release:test
node scripts/bump-versions.mjs --base HEAD^ --head HEAD
```

## SDK releases

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
