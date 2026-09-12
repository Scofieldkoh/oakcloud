// @vitest-environment node
// The existing W1 PostgreSQL suites are reused unchanged against this CI
// lane's explicitly disposable database. Keeping them in a separate Vitest
// file prevents the export suite's intentional Prisma mock from crossing into
// real-storage concurrency evidence.
process.env.TEST_DATABASE_URL ??= process.env.BUSINESS_ASSISTANT_TEST_DATABASE_URL;

await import('../a4-editor-workflow-w1.postgres.test');
await import('../document-generation-batch.postgres.test');
