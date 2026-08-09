# Internal SimpleMailer CLI

The CLI is the configuration-as-code interface for SimpleMailer. It lets teams
review sender and template changes in source control, detect drift in CI, and
apply the same configuration consistently across environments without using
the dashboard or writing an SDK script.

It is maintained as a private workspace tool and is not published to npm.

```bash
simplemailer validate --config simplemailer.yaml
simplemailer diff --config simplemailer.yaml --json
simplemailer sync --config simplemailer.yaml --ci
```

`validate` is local and does not require credentials. `diff` is read-only.
`sync` applies deterministic upserts and activations; this initial release does
not infer deletions, so remote-only resources are left untouched. CI diff exits
with code `2` when changes are present and code `1` for validation or transport
errors.

```yaml
apiVersion: simplemailer/v1
environment: production
senders:
  - alias: transactional
    displayName: Example
    fromAddress: mail@example.com
    credential:
      env: SMTP_PASSWORD
templates:
  - name: welcome
    format: HTML
    source:
      path: emails/welcome.html
    subject: Welcome
    activate: true
```

Template paths are resolved relative to the manifest. Secret references name an
environment variable; generated diff output never resolves or prints its
value.
