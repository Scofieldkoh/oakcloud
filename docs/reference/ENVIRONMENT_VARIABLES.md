# Environment Variables

> **Last Updated**: 2025-01-12
> **Audience**: Developers, Administrators

Configuration options for the Oakcloud application.

## Related Documents

- [Getting Started](../GETTING_STARTED.md) - Installation and setup
- [Architecture](../ARCHITECTURE.md) - System design overview

---

## Quick Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for JWT signing |
| `ENCRYPTION_KEY` | Yes | 32+ char key for data encryption |
| `OPENAI_API_KEY` | No | OpenAI API key for AI features |

---

## Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | - | PostgreSQL connection string |

**Example:**
```
DATABASE_URL="postgresql://oakcloud:oakcloud_password@localhost:5433/oakcloud?schema=public"
```

For production with SSL:
```
DATABASE_URL="postgresql://...?sslmode=require"
```

---

## Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | - | Secret key for JWT signing (required) |
| `JWT_EXPIRES_IN` | `7d` | Token expiration time |

**Security**: Use a long random string for `JWT_SECRET`. Generate with:
```bash
openssl rand -base64 48
```

---

## AI Providers

Configure at least one provider for AI-powered features (BizFile extraction, document processing).

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key (GPT models) |
| `ANTHROPIC_API_KEY` | Anthropic API key (Claude models) |
| `GOOGLE_AI_API_KEY` | Google AI API key (Gemini models) |
| `DEFAULT_AI_MODEL` | Default model to use (optional) |

**Available Models:**
- `gpt-5`, `gpt-4.1` (OpenAI)
- `claude-opus-4.5`, `claude-sonnet-4.5` (Anthropic)
- `gemini-3`, `gemini-2.5-flash` (Google)

---

## Application

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Public URL of the application |
| `NODE_ENV` | `development` | Environment (`development` or `production`) |
| `MAX_FILE_SIZE` | `10485760` | Max upload size in bytes (10MB) |

---

## Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `debug` (dev) / `info` (prod) | Logging verbosity |

**Log Levels** (in order of verbosity):
| Level | Description |
|-------|-------------|
| `silent` | No logging |
| `error` | Only errors |
| `warn` | Errors + warnings |
| `info` | Standard logging (production default) |
| `debug` | Include debug messages (development default) |
| `trace` | Most verbose, includes SQL queries |

---

## Storage (S3/MinIO)

| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_PROVIDER` | `s3` | Storage provider (`s3` or `local`) |
| `STORAGE_LOCAL_PATH` | `./uploads` | Local storage path (when provider=local) |
| `S3_ENDPOINT` | - | S3/MinIO endpoint URL |
| `S3_REGION` | `us-east-1` | S3 region |
| `S3_BUCKET` | - | Bucket name |
| `S3_ACCESS_KEY` | - | Access key |
| `S3_SECRET_KEY` | - | Secret key |
| `S3_FORCE_PATH_STYLE` | `true` | Use path-style URLs (required for MinIO) |
| `S3_USE_SSL` | `false` | Use HTTPS |
| `S3_ENCRYPTION` | `AES256` | Server-side encryption |
| `S3_KMS_KEY_ID` | - | KMS key ID (when encryption=aws:kms) |

**MinIO Development Setup:**
```
S3_ENDPOINT="http://localhost:9000"
S3_BUCKET="oakcloud"
S3_ACCESS_KEY="oakcloud"
S3_SECRET_KEY="oakcloud_minio_secret"
S3_FORCE_PATH_STYLE="true"
S3_USE_SSL="false"
```

**AWS S3 Production Setup:**
```
S3_ENDPOINT="https://s3.amazonaws.com"
S3_FORCE_PATH_STYLE="false"
S3_USE_SSL="true"
S3_ENCRYPTION="AES256"
```

---

## Email

### Microsoft Graph API (Recommended for M365)

| Variable | Description |
|----------|-------------|
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_CLIENT_ID` | App registration client ID |
| `AZURE_CLIENT_SECRET` | App registration secret |
| `EMAIL_FROM_ADDRESS` | Sender email address |
| `EMAIL_FROM_NAME` | Sender display name |

### SMTP (Fallback)

| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP port (usually 587) |
| `SMTP_SECURE` | Use TLS (`true`/`false`) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASSWORD` | SMTP password |

**Common SMTP Examples:**

Gmail:
```
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
```

Amazon SES:
```
SMTP_HOST="email-smtp.us-east-1.amazonaws.com"
SMTP_PORT="587"
```

SendGrid:
```
SMTP_HOST="smtp.sendgrid.net"
SMTP_PORT="587"
SMTP_USER="apikey"
```

---

## Encryption

| Variable | Default | Description |
|----------|---------|-------------|
| `ENCRYPTION_KEY` | - | 32+ char key for encrypting sensitive data |

**Required** for encrypting API keys and credentials. Generate with:
```bash
openssl rand -hex 32
```

---

## Task Scheduler

| Variable | Default | Description |
|----------|---------|-------------|
| `SCHEDULER_ENABLED` | `true` | Enable built-in task scheduler |
| `SCHEDULER_BACKUP_ENABLED` | `true` | Enable backup task |
| `SCHEDULER_BACKUP_CRON` | `0,15,30,45 * * * *` | Backup check frequency |
| `SCHEDULER_CLEANUP_ENABLED` | `true` | Enable cleanup task |
| `SCHEDULER_CLEANUP_CRON` | `0 2 * * *` | Cleanup schedule (daily 2 AM) |

### Backup Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKUP_DEFAULT_RETENTION_DAYS` | `30` | Days to keep backups |
| `BACKUP_DEFAULT_MAX_BACKUPS` | `10` | Max scheduled backups per tenant |
| `BACKUP_STALE_THRESHOLD_MINUTES` | `60` | Mark in-progress as failed after |

---

## AI Debug

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_DEBUG` | `false` | Enable AI debug logging |
| `AI_DEBUG_LOG_PROMPTS` | `true` | Include prompts in logs |
| `AI_DEBUG_LOG_RESPONSES` | `true` | Include responses in logs |
| `AI_DEBUG_LOG_IMAGES` | `false` | Include image metadata |

See [AI Debug Guide](../debug/AI_DEBUG.md) for details.

---

## Production Checklist

1. **Security**
   - `NODE_ENV="production"`
   - Strong `JWT_SECRET` (48+ chars)
   - Strong `ENCRYPTION_KEY` (32+ chars)

2. **Storage**
   - `S3_USE_SSL="true"`
   - `S3_ENCRYPTION="AES256"`
   - `S3_FORCE_PATH_STYLE="false"` (for AWS)

3. **Database**
   - Use SSL: `?sslmode=require`

4. **Logging**
   - `LOG_LEVEL="info"` (not debug/trace)
