import { PrismaClient } from '@/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, PoolConfig } from 'pg';
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

  const poolConfig: PoolConfig = {
    connectionString,
    max: 10, // Maximum connections in pool
    idleTimeoutMillis: 30000, // Close idle connections after 30s
    connectionTimeoutMillis: 5000, // Timeout for new connections
  };

  // Enable SSL for production environments (most cloud databases require it)
  // Can be disabled by setting DATABASE_SSL=false
  if (process.env.NODE_ENV === 'production' && process.env.DATABASE_SSL !== 'false') {
    poolConfig.ssl = {
      rejectUnauthorized: false, // Allow self-signed certs (common in cloud DBs)
    };
  }

  return new Pool(poolConfig);
}

/**
 * Create Prisma Client with PostgreSQL driver adapter
 * Uses the new Prisma 7 architecture for better performance
 */
function createPrismaClient(): PrismaClient {
  const logConfig = getPrismaLogConfig();
  prismaLogger.debug(`Initializing Prisma 7 with log levels: ${logConfig.join(', ') || 'none'}`);

  // Create or reuse connection pool (reuse in both dev and production)
  const pool = globalForPrisma.pool ?? createPool();
  globalForPrisma.pool = pool;

  // Create adapter with the pool
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: logConfig,
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Store prisma instance globally to prevent multiple instances
globalForPrisma.prisma = prisma;

export default prisma;
