import { PrismaClient } from '@/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { getPrismaLogConfig, createLogger } from './logger';

const prismaLogger = createLogger('prisma');

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

/**
 * Create a PostgreSQL connection pool
 * Connection pool is reused across requests for efficiency
 */
function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  return new Pool({
    connectionString,
    max: 10, // Maximum connections in pool
    idleTimeoutMillis: 30000, // Close idle connections after 30s
    connectionTimeoutMillis: 5000, // Timeout for new connections
  });
}

/**
 * Create Prisma Client with PostgreSQL driver adapter
 * Uses the new Prisma 7 architecture for better performance
 */
function createPrismaClient(): PrismaClient {
  const logConfig = getPrismaLogConfig();
  prismaLogger.debug(`Initializing Prisma 7 with log levels: ${logConfig.join(', ') || 'none'}`);

  // Create or reuse connection pool
  const pool = globalForPrisma.pool ?? createPool();
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.pool = pool;
  }

  // Create adapter with the pool
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: logConfig,
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
