# Environment Variables

> **Last Updated**: 2026-03-11
> **Audience**: Developers, administrators

Configuration options for Oakcloud.

## Related Documents

- [Getting Started](../GETTING_STARTED.md) - Local setup and first run
- [Architecture](../ARCHITECTURE.md) - Runtime design overview

## Quick Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for JWT signing |
| `ENCRYPTION_KEY` | Yes | 32+ character key for application encryption |
| `DEFAULT_AI_MODEL` | No | Default model used by AI-backed features |
| `FORM_RESPONSE_TOKEN_SECRET` | No | Secret for signed public form PDF tokens; falls back to `JWT_SECRET` if omitted |

## Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | - | PostgreSQL connection string |
| `DATABASE_SSL` | `true` in production | Enable SSL for database connections unless explicitly disabled |

Example:

```env
DATABASE_URL="postgresql://oakcloud:oakcloud_password@localhost:5433/oakcloud?schema=public"
```

## Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | - | Secret used for JWT signing |
| `JWT_EXPIRES_IN` | `7d` | Auth token lifetime |

Use a long random value for `JWT_SECRET`.

## AI Providers

These variables power AI-backed document processing, AI Helpbot flows, and Forms AI review / translation / context assist.

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `GOOGLE_AI_API_KEY` | Google AI / Gemini API key |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `OPENROUTER_SITE_URL` | Referrer sent to OpenRouter |
| `OPENROUTER_APP_NAME` | App title sent to OpenRouter |
| `DEFAULT_AI_MODEL` | Default AI model ID |

Common configured model IDs in the codebase include:

- `gpt-5.2`
- `gpt-4.1`
- `claude-opus-4.5`
- `claude-sonnet-4.5`
- `gemini-3.1`
- `gemini-3-flash`

## Application

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_APP_URL` | `https://service.oakcloud.app` | Public application base URL |
| `EMAIL_APP_URL` | `NEXT_PUBLIC_APP_URL` when omitted | Override base URL used inside email templates |
| `NODE_ENV` | `development` | Runtime mode |
| `MAX_FILE_SIZE` | `10485760` | Max upload size in bytes for standard document and public form uploads |
| `LOG_LEVEL` | `debug` in dev, `info` in prod | Logger verbosity |

## Public Forms

These variables control public form PDF token signing and download/email token lifetimes.

| Variable | Default | Description |
|----------|---------|-------------|
| `FORM_RESPONSE_TOKEN_SECRET` | Falls back to `SHARE_VERIFICATION_SECRET`, then `JWT_SECRET` | Secret for signed public form PDF tokens |
| `FORM_RESPONSE_SUBMIT_DOWNLOAD_TOKEN_TTL_SECONDS` | `1800` | Initial PDF download token lifetime after public submission |
| `FORM_RESPONSE_SUBMIT_EMAIL_REQUEST_TOKEN_TTL_SECONDS` | `1800` | Lifetime of the token that authorizes requesting a PDF email after submission |
| `FORM_RESPONSE_EMAIL_LINK_TOKEN_TTL_SECONDS` | `604800` | Lifetime of the download token embedded in the emailed PDF link |

Notes:

- In production, `FORM_RESPONSE_TOKEN_SECRET` (or a secure fallback secret) must be at least 32 characters.
- Public form draft resume uses per-draft access tokens stored in the database and does not use these env vars.

## Storage

| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_PROVIDER` | `s3` | Storage backend (`s3` or `local`) |
| `STORAGE_LOCAL_PATH` | `./uploads` | Local storage path when `STORAGE_PROVIDER=local` |
| `S3_ENDPOINT` | - | S3 or MinIO endpoint |
| `S3_REGION` | `us-east-1` | Region |
| `S3_BUCKET` | - | Bucket name |
| `S3_ACCESS_KEY` | - | Access key |
| `S3_SECRET_KEY` | - | Secret key |
| `S3_FORCE_PATH_STYLE` | `true` | Required for MinIO and other path-style endpoints |
| `S3_USE_SSL` | `false` | Use HTTPS |
| `S3_ENCRYPTION` | `AES256` | Server-side encryption mode (`AES256`, `aws:kms`, `none`) |
| `S3_KMS_KEY_ID` | - | Required when `S3_ENCRYPTION=aws:kms` |

Bundled local MinIO setup (`oakcloud_db.yml`):

```env
S3_ENDPOINT="http://localhost:9000"
S3_BUCKET="oakcloud"
S3_ACCESS_KEY="oakcloud"
S3_SECRET_KEY="Preparefortrouble!"
S3_FORCE_PATH_STYLE="true"
S3_USE_SSL="false"
```

## Email

Email is used for password reset, invitations, draft resume emails, and public form PDF delivery.

### Microsoft Graph

| Variable | Description |
|----------|-------------|
| `AZURE_TENANT_ID` | Azure tenant ID |
| `AZURE_CLIENT_ID` | App registration client ID |
| `AZURE_CLIENT_SECRET` | App registration secret |
| `EMAIL_FROM_ADDRESS` | Sender email address |
| `EMAIL_FROM_NAME` | Sender display name |

### SMTP

| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | SMTP hostname |
| `SMTP_PORT` | SMTP port |
| `SMTP_SECURE` | Use TLS (`true` / `false`) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASSWORD` | SMTP password |

## Encryption

| Variable | Default | Description |
|----------|---------|-------------|
| `ENCRYPTION_KEY` | - | 32+ character key used for encrypting sensitive application data |

Generate a value with:

```bash
openssl rand -hex 32
```

## Task Scheduler

The in-process scheduler is started by the app and can be configured per task.

| Variable | Default | Description |
|----------|---------|-------------|
| `SCHEDULER_ENABLED` | `true` | Master switch for the scheduler |
| `SCHEDULER_BACKUP_ENABLED` | `true` | Enable backup processing |
| `SCHEDULER_BACKUP_CRON` | `0,15,30,45 * * * *` | Backup polling cadence |
| `SCHEDULER_CLEANUP_ENABLED` | `true` | Enable cleanup processing |
| `SCHEDULER_CLEANUP_CRON` | `0 2 * * *` | Cleanup schedule |
| `SCHEDULER_FORM_AI_REVIEW_ENABLED` | `true` | Enable queued form AI review processing |
| `SCHEDULER_FORM_AI_REVIEW_CRON` | `*/2 * * * *` | Form AI review polling interval |
| `SCHEDULER_FORM_COUNT_RECONCILIATION_ENABLED` | `false` unless set | Enable form submission count reconciliation |
| `SCHEDULER_FORM_COUNT_RECONCILIATION_CRON` | `0 3 * * 0` | Reconciliation schedule |

Backup-related settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKUP_DEFAULT_RETENTION_DAYS` | `30` | Default retention period |
| `BACKUP_DEFAULT_MAX_BACKUPS` | `10` | Default max scheduled backups per tenant |
| `BACKUP_STALE_THRESHOLD_MINUTES` | `60` | Threshold for marking an in-progress backup as stale |

Optional external cron auth:

| Variable | Default | Description |
|----------|---------|-------------|
| `CRON_SECRET` | - | Shared secret for externally triggered cron endpoints when used |

## Tunnel / Docker

| Variable | Default | Description |
|----------|---------|-------------|
| `CLOUDFLARE_TUNNEL_TOKEN` | - | Token used by the optional `cloudflared` container in `docker-compose.yml` |

## AI Debug

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_DEBUG` | `false` | Enable AI debug logging |
| `AI_DEBUG_LOG_PROMPTS` | `true` | Include prompts in debug logs |
| `AI_DEBUG_LOG_RESPONSES` | `true` | Include responses in debug logs |
| `AI_DEBUG_LOG_IMAGES` | `false` | Include image metadata in debug logs |

## Production Checklist

1. Set `NODE_ENV="production"`.
2. Use strong values for `JWT_SECRET`, `FORM_RESPONSE_TOKEN_SECRET`, and `ENCRYPTION_KEY`.
3. Enable secure storage settings (`S3_USE_SSL="true"`, `S3_ENCRYPTION="AES256"` or `aws:kms`).
4. Use a production database connection string and keep `DATABASE_SSL` enabled unless you have a reason not to.
5. Configure email before relying on invitation, reset, or Forms email flows.
