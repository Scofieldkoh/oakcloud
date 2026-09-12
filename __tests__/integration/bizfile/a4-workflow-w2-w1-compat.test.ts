// @vitest-environment node
// W2 reuses the exact W1 capability/producer/reader/export compatibility
// suites it consumes instead of duplicating their assertions.
await import('../../../tests/lib/a4-editor-capabilities-w1.test');
await import('../../../tests/lib/a4-editor-producer-integration-w1.test');
await import('../../../tests/lib/a4-editor-server-reader-w1.test');
await import('../../../tests/services/document-export-w1.test');
