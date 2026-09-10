import {
  evaluateFullStateIndependentReview,
  type FullStateIndependentReviewInput,
  type FullStateIndependentReviewResult,
} from './full-state-independent-review';

export interface FullStateReviewContract {
  id: string;
  version: number;
  canonicalPaths: readonly string[];
}

/**
 * Reviewer-owned contract for a normalized BizFile review snapshot.
 * Each path represents the complete normalized section object/collection, not
 * just a selected change. Keeping the path set here prevents a planner,
 * mutation request, or evidence producer from shrinking the review denominator.
 */
export const BIZFILE_FULL_STATE_REVIEW_CONTRACT: FullStateReviewContract = Object.freeze({
  id: 'bizfile.normalized-full-state',
  version: 1,
  canonicalPaths: Object.freeze([
    'entity',
    'addresses',
    'activities',
    'capital',
    'officers',
    'shareholders',
    'auditor',
    'compliance',
    'charges',
    'document',
  ]),
});

export function evaluateFullStateReviewAgainstContract(
  input: FullStateIndependentReviewInput,
  contract: FullStateReviewContract,
): FullStateIndependentReviewResult {
  if (!contract.id.trim() || !Number.isInteger(contract.version) || contract.version < 1) {
    throw new Error('Full-state review contract must have a stable id and positive integer version.');
  }
  if (contract.canonicalPaths.length === 0 || new Set(contract.canonicalPaths).size !== contract.canonicalPaths.length) {
    throw new Error('Full-state review contract must declare a non-empty unique canonical path set.');
  }

  // Deliberately discard evidence-supplied canonicalPaths. Completeness is a
  // reviewer contract concern and must not be controlled by planner/mutation input.
  return evaluateFullStateIndependentReview({
    ...input,
    canonicalPaths: [...contract.canonicalPaths],
  });
}

export function evaluateBizFileFullStateIndependentReview(
  input: FullStateIndependentReviewInput,
): FullStateIndependentReviewResult {
  return evaluateFullStateReviewAgainstContract(input, BIZFILE_FULL_STATE_REVIEW_CONTRACT);
}
