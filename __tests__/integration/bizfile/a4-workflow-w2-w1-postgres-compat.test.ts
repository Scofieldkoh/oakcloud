// @vitest-environment node
// The existing W1 PostgreSQL suites are reused unchanged against this CI
// lane's explicitly disposable database. Keeping them in a separate Vitest
// file prevents the export suite's intentional Prisma mock from crossing into
// real-storage concurrency evidence.
export {};

// Assigning undefined to process.env stores the string "undefined", which
// would un-skip the suite on machines without a test database.
if (!process.env.TEST_DATABASE_URL && process.env.BUSINESS_ASSISTANT_TEST_DATABASE_URL) {
  process.env.TEST_DATABASE_URL = process.env.BUSINESS_ASSISTANT_TEST_DATABASE_URL;
}

await import('../document-generation-batch.postgres.test');
