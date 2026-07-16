# Dashboard (Next.js)

Admin UI for SimpleMailer, running on port `3001`.

## Development

From the monorepo root:

```bash
pnpm dev
```

Run only dashboard:

```bash
pnpm --dir apps/dashboard dev
```

## Scripts

```bash
pnpm --dir apps/dashboard build
pnpm --dir apps/dashboard lint
pnpm --dir apps/dashboard type-check
```

## Notes

- API calls should target dashboard route handlers (`/api/*`) during migration.
- The worker service remains responsible for queue consumption and mail execution.
