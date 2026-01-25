import { PrismaClient } from '@/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, PoolConfig } from 'pg';
import { getPrismaLogConfig, createLogger } from './logger';

const prismaLogger = createLogger('prisma');

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __prismaPool: Pool | undefined;
}

/**
 * Create a PostgreSQL connection pool
 */
function createPool(): Pool {
  if (global.__prismaPool) {
    return global.__prismaPool;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const poolConfig: PoolConfig = {
    connectionString,
    max: 20, // Increased for better concurrency
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };

  if (process.env.NODE_ENV === 'production' && process.env.DATABASE_SSL !== 'false') {
    poolConfig.ssl = { rejectUnauthorized: false };
  }

  const pool = new Pool(poolConfig);
  global.__prismaPool = pool;
  return pool;
}

/**
 * Initialize Prisma Client - called from instrumentation.ts or on first use
 */
export function initializePrisma(): PrismaClient {
  if (global.__prisma) {
    return global.__prisma;
  }

  const logConfig = getPrismaLogConfig();
  prismaLogger.debug(`Initializing Prisma 7 with log levels: ${logConfig.join(', ') || 'none'}`);

  const pool = createPool();
  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({ adapter, log: logConfig });

  global.__prisma = client;
  return client;
}

/**
 * Get the Prisma client instance
 */
export function getPrisma(): PrismaClient {
  if (!global.__prisma) {
    return initializePrisma();
  }
  return global.__prisma;
}

// CRITICAL FIX: Lazy proxy that defers initialization until first use
// This prevents module-level execution timing issues with instrumentation.ts
export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    return getPrisma()[prop as keyof PrismaClient];
  },
});

export default prisma;
