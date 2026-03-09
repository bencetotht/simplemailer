# Bulk Send Frontend Plan

## Goal
Build a dedicated manual bulk send page at `/send/bulk` for operators who need to submit paced bulk campaigns against the new `POST /api/send/bulk` API.

## Recommended UX
- Keep bulk sending separate from the current single-send page. Bulk requires validation, pacing, and result review that would overcrowd the existing `/send` form.
- Use a three-step flow:
  1. Setup: choose account and template, enter optional shared values, configure pacing.
  2. Recipients: paste JSON or upload CSV, preview parsed recipients, surface rejected rows before submit.
  3. Review: show effective counts, delay summary, and sample merged payloads before the final submit.

## Input Modes
- JSON mode:
  - Accept an array of objects shaped like `{ "recipient": "user@example.com", "values": { ... } }`.
  - Provide a starter example with one shared-values example and one per-recipient override example.
- CSV mode:
  - Require a `recipient` column.
  - Treat every additional column as a string placeholder value.
  - Offer a toggle to treat blank cells as “no override” instead of an empty string.
- Shared values:
  - Reuse the existing key/value or raw JSON editing pattern from `/send`.
  - Show that recipient-level values override shared values.

## Validation / Preview
- Run lightweight client-side parsing for JSON/CSV shape errors, but treat the API as the source of truth.
- Before submit, render a table with:
  - row number
  - recipient
  - merged values preview
  - local validation state
- After submit, display the API’s `rejectedItems` exactly as returned so the operator can correct only the bad rows.

## Submit / Status
- On submit, call `POST /api/send/bulk` and show:
  - `batchId`
  - requested, accepted, rejected counts
  - effective delay in seconds
- Poll `GET /api/send/bulk/{id}` for status updates.
- Show item-level badges for `REJECTED`, `ENQUEUE_PENDING`, `QUEUED`, `PROCESSING`, `RETRYING`, `SENT`, `FAILED`, and `DEAD`.
- Link to the Swagger docs page so operators can inspect the raw request/response contract.

## UI Notes
- Include a “Download rejected rows” action after submit.
- Keep the recipients preview virtualized or paginated once the list exceeds 100 rows.
- Show a clear warning that bulk sends are paced automatically and may continue running after the page is closed.
