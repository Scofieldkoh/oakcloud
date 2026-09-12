// @vitest-environment node
// W2 reuses the exact W1 compatibility suites for the producer/read/export
// boundaries it consumes instead of duplicating their assertions. The
// PostgreSQL suites are pointed only at the CI lane's already-guarded,
// disposable database.
process.env.TEST_DATABASE_URL ??= process.env.BUSINESS_ASSISTANT_TEST_DATABASE_URL;

await import('../../../tests/lib/a4-editor-capabilities-w1.test');
await import('../../../tests/lib/a4-editor-producer-integration-w1.test');
await import('../../../tests/lib/a4-editor-server-reader-w1.test');
await import('../../../tests/services/document-export-w1.test');
await import('../a4-editor-workflow-w1.postgres.test');
await import('../document-generation-batch.postgres.test');
