import type { CapabilityCorrectionContext, CapabilityCorrectionHandler } from './contracts';

/**
 * Optional pre-transaction work for a correction handler. This stage may do
 * authorized external I/O, but its output is evidence only: the transactional
 * correction handler must revalidate all mutable source/target state before
 * returning a prepared item.
 */
export interface CapabilityCorrectionPrefetchContext {
  actor: CapabilityCorrectionContext['actor'];
  request: unknown;
  sourceRunId: string;
  db: unknown;
}

export type CapabilityCorrectionPrefetchHandler = (
  context: CapabilityCorrectionPrefetchContext,
) => Promise<unknown>;

/**
 * A correction handler may accept prefetched evidence as an optional second
 * argument while remaining assignable to the canonical one-argument handler
 * contract used by existing capabilities.
 */
export type PrefetchableCapabilityCorrectionHandler = (
  (context: CapabilityCorrectionContext, prefetched?: unknown) => ReturnType<CapabilityCorrectionHandler>
) & {
  prefetch?: CapabilityCorrectionPrefetchHandler;
};

export function withCorrectionPrefetch(
  handler: (context: CapabilityCorrectionContext, prefetched?: unknown) => ReturnType<CapabilityCorrectionHandler>,
  prefetch: CapabilityCorrectionPrefetchHandler,
): PrefetchableCapabilityCorrectionHandler {
  return Object.assign(handler, { prefetch });
}

export function asPrefetchableCorrectionHandler(
  handler: CapabilityCorrectionHandler,
): PrefetchableCapabilityCorrectionHandler {
  return handler as PrefetchableCapabilityCorrectionHandler;
}
