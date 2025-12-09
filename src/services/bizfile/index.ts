/**
 * BizFile Service Module
 *
 * This module handles ACRA BizFile document extraction and processing.
 *
 * Module Structure:
 * - types.ts: Type definitions and entity mapping functions
 * - extractor.ts: AI-based extraction (extractBizFileWithVision, extractBizFileData)
 * - normalizer.ts: Data normalization (normalizeExtractedData, buildFullAddress)
 * - diff.ts: Change detection (generateBizFileDiff)
 * - processor.ts: Database updates (processBizFileExtraction, processBizFileExtractionSelective)
 */

// Re-export all types
export type {
  ExtractedBizFileData,
  BizFileVisionInput,
  BizFileExtractionOptions,
  BizFileExtractionResult,
  BizFileDiffEntry,
  ExtractedOfficerData,
  ExtractedShareholderData,
  OfficerDiffEntry,
  ShareholderDiffEntry,
  OfficerAction,
  ExtendedBizFileDiffResult,
  SelectiveProcessingResult,
  ProcessingResult,
} from './types';

// Re-export mapping functions
export {
  mapEntityType,
  mapCompanyStatus,
  mapOfficerRole,
  mapContactType,
  mapIdentificationType,
} from './types';

// Re-export extraction functions
export {
  extractBizFileWithVision,
  extractBizFileData,
} from './extractor';

// Re-export normalization functions
export {
  normalizeExtractedData,
  buildFullAddress,
} from './normalizer';

// Re-export diff function
export {
  generateBizFileDiff,
} from './diff';

// Re-export processing functions
export {
  processBizFileExtraction,
  processBizFileExtractionSelective,
} from './processor';
