// @vitest-environment node
// The existing disposable BizFile/W2 CI lane recursively executes this folder.
// Import the pure W2 batch acknowledgement contract so the same Node 24 run
// covers stale-server acknowledgements and per-item state isolation without
// changing I-owned workflow/test-runner configuration.
import '../../components/documents/generation-batch/batch-workflow-ack.test';
