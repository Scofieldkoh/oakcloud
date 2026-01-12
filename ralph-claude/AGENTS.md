# Oakcloud Codebase Patterns

This file is updated by Ralph with discovered patterns. Read before each iteration.

## Architecture

- Next.js 15 App Router with React 19
- Prisma 7 with PostgreSQL (port 5433 in Docker)
- Multi-tenant: ALL queries must include tenantId
- RBAC: resource:action format permissions

## Code Conventions

- Path alias: `@/` maps to `src/`
- Components: `src/components/ui/` for reusable UI
- Services: `src/services/` for business logic
- Validations: Zod schemas in `src/lib/validations/`
- Generated Prisma client: import from `@/generated/prisma`

## API Route Patterns

- Always call `getSession()` first
- Check permissions with `requirePermission(session, resource, action)`
- Return appropriate HTTP status codes
- Include tenantId in all database queries

## UI Patterns

- Use Chakra UI components with custom styling
- Linear.app-inspired design, compact, 4px grid
- Store number inputs as strings, parse on submit
- Use Zustand for client state, TanStack Query for server state

## Testing

- Use Vitest for unit tests
- Mock Prisma client for database tests
- Run `npm run test:run` to verify

## Discovered Patterns

- Validation schemas: Service-related enums (serviceTypeEnum, serviceStatusEnum, billingFrequencyEnum) exist in both `contract.ts` and `service.ts` validations. Form validation may use string-to-number transforms for rate/renewalPeriodMonths fields.
- Context setState types: When passing useState setters through React Context, use `React.Dispatch<React.SetStateAction<T>>` type to allow functional updates.

## Known Gotchas

- Number inputs revert if stored as number (use string)
- Always include tenantId or queries return wrong data
- Use createAuditContext for all data changes
- Session includes companyIds array (authoritative for access)
