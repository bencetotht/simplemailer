# SimpleMailer Helm chart

This chart deploys the SimpleMailer dashboard/API and worker. It deliberately does **not** deploy PostgreSQL, RabbitMQ, S3/MinIO, Prometheus, Traefik, or an OpenTelemetry collector. Supply those services separately and pass connection details through a Kubernetes Secret.

## Install

Create a Secret (recommended):

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: simplemailer-runtime
type: Opaque
stringData:
  DATABASE_URL: postgresql://user:password@postgres.example:5432/simplemailer
  RABBITMQ_URL: amqps://user:password@rabbitmq.example:5671
  SECRETS_MASTER_KEY: replace-with-at-least-32-random-bytes
  DASHBOARD_API_KEY: replace-me
  DASHBOARD_PASSWORD: replace-me
  DASHBOARD_SESSION_SECRET: replace-with-an-independent-random-secret
  RABBITMQ_API_USER: user
  RABBITMQ_API_PASS: password
  S3_ACCESS_KEY: optional-for-workload-identity
  S3_SECRET_KEY: optional-for-workload-identity
  S3_SESSION_TOKEN: optional
```

Then install from GHCR:

```bash
helm install simplemailer oci://ghcr.io/bencetotht/charts/simplemailer \
  --namespace simplemailer --create-namespace \
  --set secrets.existingSecret=simplemailer-runtime \
  --set dashboard.config.rabbitmqApiUrl=https://rabbitmq.example/api \
  --set dashboard.config.s3Bucket=mail-templates \
  --set worker.config.s3Bucket=mail-templates
```

The three required Secret keys are `DATABASE_URL`, `RABBITMQ_URL`, and `SECRETS_MASTER_KEY`. Dashboard production deployments should also set `DASHBOARD_API_KEY`, `DASHBOARD_PASSWORD`, and `DASHBOARD_SESSION_SECRET`. RabbitMQ management credentials are needed for dashboard queue statistics. S3 credentials may be omitted when workload identity supplies them.

For disposable development environments, set `secrets.create=true` and populate `secrets.values`. Do not commit those values or pass them on a shared command line. Helm stores release values, so an externally managed Secret is safer.

## Important values

| Value | Default | Purpose |
| --- | --- | --- |
| `secrets.existingSecret` | `""` | Existing runtime Secret; recommended for production. |
| `secrets.create` | `false` | Render a Secret from `secrets.values` for development. |
| `dashboard.enabled` | `true` | Deploy the combined web dashboard and HTTP API. |
| `dashboard.image.repository/tag` | GHCR/versioned | Dashboard image coordinates. |
| `worker.image.repository/tag` | GHCR/versioned | Worker and migration image coordinates. |
| `dashboard.config.rabbitmqApiUrl` | `""` | RabbitMQ management API URL. |
| `*.config.s3Bucket` | `""` | Existing S3 bucket containing templates. |
| `*.config.s3Endpoint` | `""` | Optional S3-compatible endpoint; leave blank for AWS. |
| `migrations.enabled` | `true` | Run `prisma migrate deploy` as an init container. |
| `ingress.enabled` | `false` | Create a standard Kubernetes Ingress. |
| `traefik.ingressRoute.enabled` | `false` | Create a Traefik `IngressRoute` instead. |
| `serviceMonitor.enabled` | `false` | Create a Prometheus Operator `ServiceMonitor` for workers. |
| `observability.podAnnotations` | `{}` | Common collector/operator injection annotations. |
| `dashboard.extraContainers`, `worker.extraContainers` | `[]` | Add logging or telemetry sidecars. |
| `networkPolicy.enabled` | `false` | Enable a caller-supplied ingress/egress policy. |

See [values.yaml](values.yaml) for resource, autoscaling, scheduling, security-context, sidecar, and probe settings.

## Database migrations

With migrations enabled, the worker image runs `prisma migrate deploy` before the dashboard starts. When the dashboard is disabled, the migration init container is attached to the worker instead. Prisma serializes migration application, but each new pod still checks migration state; disable the init container only if migrations are managed by a separate deployment process.

## Ingress

Standard Ingress and Traefik `IngressRoute` are mutually exclusive. The application accepts bodies up to 4 MiB; configure the selected ingress controller accordingly. For nginx-ingress, for example:

```yaml
ingress:
  enabled: true
  className: nginx
  annotations:
    nginx.ingress.kubernetes.io/proxy-body-size: 4m
```

Traefik CRDs must already be installed:

```yaml
traefik:
  ingressRoute:
    enabled: true
    entryPoints: [websecure]
    routes:
      - match: Host(`mailer.example.com`)
        kind: Rule
        middlewares: []
    tls:
      certResolver: letsencrypt
```

## Monitoring and logs

Workers expose `/metrics`, `/healthz`, `/readyz`, and `/autoscale` on port 9091. Enable `serviceMonitor` only when the Prometheus Operator CRD is present. The default HPA uses CPU because Kubernetes cannot consume the worker's Prometheus queue-pressure gauge without an external-metrics adapter.

Both applications log to stdout/stderr, so a node-level OpenTelemetry Collector, Fluent Bit, or Vector daemon is the simplest export path. The applications do not currently emit OTLP natively. Use `observability.podAnnotations` for operator injection, or `extraContainers`, `extraVolumes`, and `extraVolumeMounts` for a sidecar required by your platform.

## Security and networking

Pods run as non-root, drop Linux capabilities, use the runtime-default seccomp profile, disable service-account token mounts, and use a read-only root filesystem with a writable `/tmp`. Default resource requests/limits and disruption budgets are included.

NetworkPolicy is opt-in because required endpoints are installation-specific. Workers generally require DNS plus egress to PostgreSQL, RabbitMQ, S3, SMTP servers, and configured webhook targets. Dashboard pods require PostgreSQL, RabbitMQ, S3, and ingress-controller traffic. Enabling the policy with empty rules intentionally denies all traffic.

## Uninstall

```bash
helm uninstall simplemailer --namespace simplemailer
```

The chart never owns external databases, queues, object storage, or externally created Secrets, so uninstalling does not delete them.
