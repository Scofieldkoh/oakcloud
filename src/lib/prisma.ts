import { PrismaClient } from '@prisma/client';
import { getPrismaLogConfig, createLogger } from './logger';

const prismaLogger = createLogger('prisma');

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const logConfig = getPrismaLogConfig();

  prismaLogger.debug(`Initializing Prisma with log levels: ${logConfig.join(', ') || 'none'}`);

  return new PrismaClient({
    log: logConfig,
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
