# `@simplemailer/contracts`

Shared runtime validators and inferred TypeScript types for SimpleMailer's
public `/v1` API. The dashboard, OpenAPI generator, SDK, and CLI consume these
definitions so request validation and published types cannot drift
independently.

This package follows the API compatibility rules in `API_UPGRADE_PLAN.md`:
optional additions are non-breaking, callers should tolerate new status values,
and removals or semantic changes require a new API version.
