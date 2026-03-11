# Getting Started

> **Last Updated**: 2026-03-11
> **Audience**: Developers

This guide walks you through setting up Oakcloud for local development.

## Related Documents

- [Architecture](./ARCHITECTURE.md) - System design and runtime layout
- [Environment Variables](./reference/ENVIRONMENT_VARIABLES.md) - Configuration options

## Prerequisites

- Node.js 20+
- Docker Desktop or Docker Engine with Compose support
- npm

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file
cp .env.example .env

# 3. Start PostgreSQL + MinIO
npm run docker:db:up

# 4. Generate Prisma client and initialize the database
npm run db:generate
npm run db:push
npm run db:seed

# 5. Start the local Next.js dev server
npm run dev
```

If you are using the bundled MinIO service from `oakcloud_db.yml`, update your local `.env` after copying it so the S3 settings match that stack before starting the app:

```env
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY="oakcloud"
S3_SECRET_KEY="Preparefortrouble!"
S3_BUCKET="oakcloud"
```

**Access**

- Frontend: `http://localhost:3000`
- Prisma Studio: `npm run db:studio`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`

**Default Login**

- Super Admin: `admin@oaktreesolutions.com.sg` / `Preparefortrouble!`

## Local Data Services

`npm run docker:db:up` starts the local data stack from [`oakcloud_db.yml`](../oakcloud_db.yml):

| Service | Port | Description |
|---------|------|-------------|
| PostgreSQL | `5433` | Primary development database |
| MinIO S3 API | `9000` | Object storage API |
| MinIO Console | `9001` | Object storage UI |

**MinIO Console Credentials**

- Username: `oakcloud`
- Password: `Preparefortrouble!`

To stop the data stack:

```bash
npm run docker:db:down
```

## Optional Containerized App Stack

`npm run docker:up` starts the containerized app stack from [`docker-compose.yml`](../docker-compose.yml):

| Service | Port | Description |
|---------|------|-------------|
| App | `3000` | Next.js app in Docker |
| Redis | `6379` | Optional cache / support service |
| Cloudflared | - | Optional tunnel container |

Use this when you want the app itself running in Docker. Do not run it alongside `npm run dev` unless you intentionally want the Dockerized app bound to port `3000`.

To stop it:

```bash
npm run docker:down
```

## Environment Notes

- `DATABASE_URL` should point at `localhost:5433` when you use the bundled PostgreSQL container.
- `S3_ENDPOINT` should point at `http://localhost:9000` when you use the bundled MinIO container.
- `MAX_FILE_SIZE` applies to document uploads and public form uploads.
- Email configuration is optional in development, but required for password reset emails, form draft emails, and public form PDF email delivery.

## Database Commands

| Command | Description |
|---------|-------------|
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push schema to the database |
| `npm run db:migrate` | Create and run a development migration |
| `npm run db:seed` | Seed local sample data |
| `npm run db:studio` | Open Prisma Studio |

The seed script is idempotent and can be run multiple times safely.

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the local dev server |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run test:run` | Run the test suite once |
| `npm run test:coverage` | Run tests with coverage |

## Common Issues

### Port `3000` already in use

You probably have the containerized app stack running. Stop it with:

```bash
npm run docker:down
```

### Port `5433` already in use

Another PostgreSQL instance is bound to that port.

```bash
npm run docker:db:down
```

Then either free the port or point `DATABASE_URL` at a different database instance.

### Storage or upload errors

1. Confirm MinIO is running on `http://localhost:9000`.
2. Confirm your local `.env` matches the MinIO credentials used by `oakcloud_db.yml`.
3. Check `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, and `S3_BUCKET`.

### Prisma client or schema mismatch

Regenerate the client and re-push the schema:

```bash
npm run db:generate
npm run db:push
```

## Next Steps

1. Create or select a tenant.
2. Create users and companies.
3. Explore the Forms module at `/forms`.
4. Explore document generation, document processing, workflow, and exchange rates.
