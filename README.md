# simplemailer

## Todo
- [ ] MJML rendering
- [ ] S3 capability
- [ ] REST API for triggering mail sending
- [ ] Custom subjects
- [ ] Support for attachments
- [ ] Support for react-mail
- [ ] Prometheus metric for sent mail / min

## Architecture
```mermaid
graph TD
  subgraph Frontend["Admin Dashboard - Next.js"]
    A1["User Interface"]
    A2["API Routes / Server Actions"]
  end

  subgraph Services
    B1["PostgreSQL"]
    B2["S3 - MJML Templates"]
    B3["RabbitMQ"]
    B4["Metrics - Prometheus"]
  end

  subgraph Workers["NestJS Mailer Workers (Kubernetes Pods)"]
    C1["Worker Pod 1"]
    C2["Worker Pod N"]
  end

  subgraph Cloud["Email Provider (SMTP / SES / SendGrid)"]
    D1["Email Service"]
  end

  A1 --> A2
  A2 -->|Enqueue Job| B3
  A2 -->|Store Metadata| B1
  A2 -->|Upload Template| B2
  A2 -->|Read Metrics| B4

  B3 --> C1
  B3 --> C2

  C1 -->|Fetch Template| B2
  C2 -->|Fetch Template| B2

  C1 -->|Send Email| D1
  C2 -->|Send Email| D1

  C1 -->|Log Result| B1
  C2 -->|Log Result| B1

  C1 -->|Expose Metrics| B4
  C2 -->|Expose Metrics| B4
```