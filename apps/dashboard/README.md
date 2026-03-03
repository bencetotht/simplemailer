# Dashboard (Next.js)

Admin UI for SimpleMailer, running on port `3001`.

## Development

From the monorepo root:

```bash
bun run dev
```

Run only dashboard:

```bash
bun --cwd apps/dashboard run dev
```

## Scripts

```bash
bun --cwd apps/dashboard run build
bun --cwd apps/dashboard run lint
bun --cwd apps/dashboard run type-check
```

## Notes

- API calls should target dashboard route handlers (`/api/*`) during migration.
- The worker service remains responsible for queue consumption and mail execution.
