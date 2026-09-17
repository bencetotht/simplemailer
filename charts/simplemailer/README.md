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
  # Generate with: openssl rand -base64 32
  SECRETS_MASTER_KEY: replace-with-base64-encoded-32-byte-key
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
| `worker.autoscaling.enabled` | `true` | Scale workers from queue pressure; always keeps at least two. |
| `worker.autoscaling.minReplicas` | `2` | Minimum continuously running worker replicas. |
| `worker.autoscaling.metrics` | external pressure metric | HPA v2 metric specification; replace if your adapter uses another name. |
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

Workers expose `/metrics`, `/healthz`, `/readyz`, and `/autoscale` on port 9091. The Prometheus output includes `mailer_autoscale_pressure`, calculated from ready queue depth, retry backlog, in-flight work, and active workers. The worker HPA is enabled by default, targets that metric at `1`, scales between 2 and 50 replicas, scales up aggressively, and uses a five-minute scale-down stabilization window.

Kubernetes does not consume Prometheus metrics directly. Install and configure a metrics adapter (for example, Prometheus Adapter or an equivalent managed-cloud adapter) so `mailer_autoscale_pressure` is available from `external.metrics.k8s.io`. The adapter and Prometheus remain external dependencies. Enable `serviceMonitor` only when the Prometheus Operator CRD is installed; otherwise configure your existing scraper against the worker service's `/metrics` endpoint. Until the external metric is available, the HPA reports an unavailable metric and leaves the Deployment at its existing replica count, which defaults to two.

A Prometheus Adapter external rule can aggregate the identical cluster-pressure gauge exposed by each worker into the single value expected by the HPA:

```yaml
rules:
  external:
    - seriesQuery: 'mailer_autoscale_pressure{namespace!="",pod!=""}'
      resources:
        overrides:
          namespace:
            resource: namespace
      name:
        matches: ^mailer_autoscale_pressure$
        as: mailer_autoscale_pressure
      metricsQuery: 'max(<<.Series>>{<<.LabelMatchers>>})'
```

Confirm the adapter before relying on autoscaling:

```bash
kubectl get --raw '/apis/external.metrics.k8s.io/v1beta1/namespaces/simplemailer/mailer_autoscale_pressure'
kubectl get hpa -n simplemailer
```

Both applications log to stdout/stderr, so a node-level OpenTelemetry Collector, Fluent Bit, or Vector daemon is the simplest export path. The applications do not currently emit OTLP natively. Use `observability.podAnnotations` for operator injection, or `extraContainers`, `extraVolumes`, and `extraVolumeMounts` for a sidecar required by your platform.

## Secrets and initial access

The chart requires these keys in `secrets.existingSecret`:

| Key | Used by | Required |
| --- | --- | --- |
| `DATABASE_URL` | migrations, dashboard, worker | Yes |
| `RABBITMQ_URL` | dashboard, worker | Yes |
| `SECRETS_MASTER_KEY` | dashboard, worker | Yes in production; must be base64 that decodes to exactly 32 bytes (`openssl rand -base64 32`) |
| `DASHBOARD_PASSWORD` | browser dashboard login | Yes when the dashboard is enabled in production |
| `DASHBOARD_SESSION_SECRET` | dashboard session signing | Yes when the dashboard is enabled in production; generate independently |
| `DASHBOARD_API_KEY` | legacy server-to-server API | Yes if legacy endpoints are used; recommended for production |
| `RABBITMQ_API_USER` / `RABBITMQ_API_PASS` | dashboard queue statistics | Required only when those statistics are used |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_SESSION_TOKEN` | S3 template storage | Only when workload identity or the platform credential chain is not used |

Database and RabbitMQ URLs frequently contain credentials and therefore stay in the Secret rather than the ConfigMap. Endpoint names, regions, bucket names, tuning settings, and ingress configuration are non-secret chart values.

SMTP account logins are not global chart credentials. They are created through the dashboard/API and encrypted in PostgreSQL with `SECRETS_MASTER_KEY`. If accounts are seeded from a custom `config.yaml`, entries can reference environment variables such as `env:MAIL_ACCOUNT_PASSWORD`; inject those variables with `dashboard.extraEnv`/`worker.extraEnv` using `secretKeyRef`. The same pattern applies to per-bucket credentials in a seed file.

SimpleMailer has no built-in root-user credential. `DASHBOARD_PASSWORD` is the operator login for the web dashboard. Project API keys are bootstrapped separately with the dashboard's `project:bootstrap` command from a trusted environment and are printed only once; they are not generated or retained by this chart.

## Security and networking

Pods run as non-root, drop Linux capabilities, use the runtime-default seccomp profile, disable service-account token mounts, and use a read-only root filesystem with a writable `/tmp`. Default resource requests/limits and disruption budgets are included.

NetworkPolicy is opt-in because required endpoints are installation-specific. Workers generally require DNS plus egress to PostgreSQL, RabbitMQ, S3, SMTP servers, and configured webhook targets. Dashboard pods require PostgreSQL, RabbitMQ, S3, and ingress-controller traffic. Enabling the policy with empty rules intentionally denies all traffic.

## Uninstall

```bash
helm uninstall simplemailer --namespace simplemailer
```

The chart never owns external databases, queues, object storage, or externally created Secrets, so uninstalling does not delete them.
