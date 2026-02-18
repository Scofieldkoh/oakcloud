# Getting Started

> **Last Updated**: 2025-01-12
> **Audience**: Developers

This guide walks you through setting up Oakcloud for local development.

## Related Documents

- [Architecture](./ARCHITECTURE.md) - System design and tech stack
- [Environment Variables](./reference/ENVIRONMENT_VARIABLES.md) - Configuration options

---

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **Docker & Docker Compose** (for PostgreSQL, Redis, MinIO)
- **npm** (or pnpm/yarn)

---

## Quick Start

```bash
# 1. Install dependencies
cd oakcloud
npm install

# 2. Copy environment file
cp .env.example .env
# Edit .env with your configuration

# 3. Start Docker containers
npm run docker:up

# 4. Initialize database
npm run db:generate   # Generate Prisma client
npm run db:push       # Push schema to database
npm run db:seed       # Seed with sample data

# 5. Start development server
npm run dev
```

**Access the application:**
- Frontend: http://localhost:3000
- Database Studio: `npm run db:studio`
- MinIO Console: http://localhost:9001

---

## Docker Setup

Running `npm run docker:up` creates:

| Service | Port | Description |
|---------|------|-------------|
| PostgreSQL | 5433 | Database (avoids conflict with local PG on 5432) |
| Redis | 6379 | Cache/sessions (optional) |
| MinIO S3 API | 9000 | Object storage |
| MinIO Console | 9001 | Storage web UI |

**MinIO Credentials**: `oakcloud` / `oakcloud_minio_secret`

### Stop Containers

```bash
npm run docker:down
```

---

## Local PostgreSQL (Alternative)

If you prefer a local PostgreSQL installation instead of Docker:

1. **Connect as superuser:**
```bash
psql -U postgres
```

2. **Create database and user:**
```sql
CREATE USER oakcloud WITH PASSWORD 'oakcloud_password';
CREATE DATABASE oakcloud OWNER oakcloud;
GRANT ALL PRIVILEGES ON DATABASE oakcloud TO oakcloud;
\c oakcloud
GRANT ALL ON SCHEMA public TO oakcloud;
```

3. **Update `.env`** to use port 5432:
```
DATABASE_URL="postgresql://oakcloud:oakcloud_password@localhost:5432/oakcloud?schema=public"
```

---

## Database Commands

| Command | Description |
|---------|-------------|
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push schema to database (creates tables) |
| `npm run db:migrate` | Create a migration |
| `npm run db:seed` | Seed with sample data |
| `npm run db:studio` | Open Prisma Studio |

> **Note**: The seed script is idempotent and can be run multiple times safely.

---

## Default Credentials

After seeding, login with:

| Role | Email | Password |
|------|-------|----------|
| Super Admin | `admin@oaktreesolutions.com.sg` | `Preparefortrouble!` |

> **Security**: Change this password in production!

The minimal seed creates only the SUPER_ADMIN user. Use this account to create tenants, users, and companies through the Admin dashboard.

---

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with Turbopack |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run test:run` | Run tests |
| `npm run test:coverage` | Run tests with coverage |

---

## Common Issues

### Port 5433 already in use
If you have another PostgreSQL instance running:
```bash
# Stop the Docker containers
npm run docker:down

# Check what's using the port
netstat -ano | findstr :5433  # Windows
lsof -i :5433                 # macOS/Linux
```

### Prisma client errors
Regenerate the Prisma client:
```bash
npm run db:generate
```

### Database connection issues
1. Ensure Docker containers are running: `docker ps`
2. Check `.env` has correct `DATABASE_URL`
3. Verify PostgreSQL is accepting connections

### Storage/upload errors
1. Ensure MinIO is running: http://localhost:9001
2. Check `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` in `.env`

---

## Next Steps

1. **Create a tenant**: Admin > Tenants > Add Tenant
2. **Complete setup wizard**: Configure the tenant and create admin user
3. **Create companies**: Navigate to Companies > Add Company
4. **Explore features**: Document generation, processing, exchange rates
