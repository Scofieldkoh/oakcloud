/**
 * Next.js Instrumentation
 *
 * This file runs once when the server starts.
 * Used to initialize the backup scheduler.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run in Node.js runtime (not Edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Dynamic import to ensure proper initialization
    const { initializeScheduler } = await import('@/lib/scheduler');
    await initializeScheduler();
  }
}
