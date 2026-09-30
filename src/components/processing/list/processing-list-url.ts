/** Reads and writes the Document Processing list filters in the page URL. */

import {
  type ProcessingDocumentSearchParams,
} from '@/hooks/use-processing-documents';
import { type ProcessingFilterValues } from '@/components/processing/processing-filters';
import { type AmountFilterValue } from '@/components/ui/amount-filter';
import type { PipelineStatus, DuplicateStatus, RevisionStatus, DocumentCategory, DocumentSubCategory } from '@/generated/prisma';
import { parseAmountFilter } from '@/components/processing/list/processing-list-config';

/** Amount filters (single value or range) read from the URL. */
function parseAmountFilterParams(searchParams: URLSearchParams) {
  const params: Partial<ProcessingDocumentSearchParams> = {};

  // Subtotal
  const subtotal = parseAmountFilter(searchParams, 'subtotal');
  if (subtotal?.mode === 'single') params.subtotal = subtotal.single;
  if (subtotal?.mode === 'range') {
    params.subtotalFrom = subtotal.range?.from;
    params.subtotalTo = subtotal.range?.to;
  }

  // Tax
  const tax = parseAmountFilter(searchParams, 'tax');
  if (tax?.mode === 'single') params.tax = tax.single;
  if (tax?.mode === 'range') {
    params.taxFrom = tax.range?.from;
    params.taxTo = tax.range?.to;
  }

  // Total
  const total = parseAmountFilter(searchParams, 'total');
  if (total?.mode === 'single') params.total = total.single;
  if (total?.mode === 'range') {
    params.totalFrom = total.range?.from;
    params.totalTo = total.range?.to;
  }

  // Home Subtotal
  const homeSubtotal = parseAmountFilter(searchParams, 'homeSubtotal');
  if (homeSubtotal?.mode === 'single') params.homeSubtotal = homeSubtotal.single;
  if (homeSubtotal?.mode === 'range') {
    params.homeSubtotalFrom = homeSubtotal.range?.from;
    params.homeSubtotalTo = homeSubtotal.range?.to;
  }

  // Home Tax
  const homeTax = parseAmountFilter(searchParams, 'homeTax');
  if (homeTax?.mode === 'single') params.homeTax = homeTax.single;
  if (homeTax?.mode === 'range') {
    params.homeTaxFrom = homeTax.range?.from;
    params.homeTaxTo = homeTax.range?.to;
  }

  // Home Total
  const homeTotal = parseAmountFilter(searchParams, 'homeTotal');
  if (homeTotal?.mode === 'single') params.homeTotal = homeTotal.single;
  if (homeTotal?.mode === 'range') {
    params.homeTotalFrom = homeTotal.range?.from;
    params.homeTotalTo = homeTotal.range?.to;
  }

  return params;
}

/** The list filters, sort and page encoded in the URL. */
export function processingParamsFromUrl(searchParams: URLSearchParams): ProcessingDocumentSearchParams {
  const tagIdsParam = searchParams.get('tagIds');
  return {
    page: parseInt(searchParams.get('page') || '1', 10),
    limit: parseInt(searchParams.get('limit') || '20', 10),
    sortBy: searchParams.get('sortBy') || 'createdAt',
    sortOrder: (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc',
    pipelineStatus: (searchParams.get('pipelineStatus') || undefined) as PipelineStatus | undefined,
    duplicateStatus: (searchParams.get('duplicateStatus') || undefined) as DuplicateStatus | undefined,
    revisionStatus: (searchParams.get('revisionStatus') || undefined) as RevisionStatus | undefined,
    needsReview: searchParams.get('needsReview') === 'true' ? true : undefined,
    isContainer: searchParams.get('isContainer') === 'true' ? true :
      searchParams.get('isContainer') === 'false' ? false : undefined,
    // New filter parameters
    companyId: searchParams.get('companyId') || undefined,
    uploadDatePreset: (searchParams.get('uploadDatePreset') || undefined) as 'TODAY' | undefined,
    uploadDateFrom: searchParams.get('uploadDateFrom') || undefined,
    uploadDateTo: searchParams.get('uploadDateTo') || undefined,
    documentDateFrom: searchParams.get('documentDateFrom') || undefined,
    documentDateTo: searchParams.get('documentDateTo') || undefined,
    search: searchParams.get('search') || undefined,
    vendorName: searchParams.get('vendorName') || undefined,
    documentNumber: searchParams.get('documentNumber') || undefined,
    fileName: searchParams.get('fileName') || undefined,
    // Category filters
    documentCategory: (searchParams.get('documentCategory') || undefined) as DocumentCategory | undefined,
    documentSubCategory: (searchParams.get('documentSubCategory') || undefined) as DocumentSubCategory | undefined,
    // Tag filter
    tagIds: tagIdsParam ? tagIdsParam.split(',').filter(Boolean) : undefined,
    // Currency filters
    currency: searchParams.get('currency') || undefined,
    homeCurrency: searchParams.get('homeCurrency') || undefined,
    // Amount filters - parse using helper function
    ...parseAmountFilterParams(searchParams),
  };
}

/** The /processing URL for the given filters, leaving defaults out. */
export function processingListUrl(params: ProcessingDocumentSearchParams): string {
  const urlParams = new URLSearchParams();

  if (params.page && params.page > 1) urlParams.set('page', params.page.toString());
  if (params.limit && params.limit !== 20) urlParams.set('limit', params.limit.toString());
  if (params.sortBy && params.sortBy !== 'createdAt') urlParams.set('sortBy', params.sortBy);
  if (params.sortOrder && params.sortOrder !== 'desc') urlParams.set('sortOrder', params.sortOrder);
  if (params.pipelineStatus) urlParams.set('pipelineStatus', params.pipelineStatus);
  if (params.duplicateStatus) urlParams.set('duplicateStatus', params.duplicateStatus);
  if (params.revisionStatus) urlParams.set('revisionStatus', params.revisionStatus);
  if (params.needsReview) urlParams.set('needsReview', 'true');
  if (params.isContainer !== undefined) urlParams.set('isContainer', params.isContainer.toString());
  // New filter parameters
  if (params.companyId) urlParams.set('companyId', params.companyId);
  if (params.uploadDatePreset) urlParams.set('uploadDatePreset', params.uploadDatePreset);
  if (params.uploadDateFrom) urlParams.set('uploadDateFrom', params.uploadDateFrom);
  if (params.uploadDateTo) urlParams.set('uploadDateTo', params.uploadDateTo);
  if (params.documentDateFrom) urlParams.set('documentDateFrom', params.documentDateFrom);
  if (params.documentDateTo) urlParams.set('documentDateTo', params.documentDateTo);
  if (params.search) urlParams.set('search', params.search);
  if (params.vendorName) urlParams.set('vendorName', params.vendorName);
  if (params.documentNumber) urlParams.set('documentNumber', params.documentNumber);
  if (params.fileName) urlParams.set('fileName', params.fileName);
  // Category filters
  if (params.documentCategory) urlParams.set('documentCategory', params.documentCategory);
  if (params.documentSubCategory) urlParams.set('documentSubCategory', params.documentSubCategory);
  // Tag filter
  if (params.tagIds && params.tagIds.length > 0) urlParams.set('tagIds', params.tagIds.join(','));
  // Currency filters
  if (params.currency) urlParams.set('currency', params.currency);
  if (params.homeCurrency) urlParams.set('homeCurrency', params.homeCurrency);
  // Amount filters
  if (params.subtotal !== undefined) urlParams.set('subtotal', params.subtotal.toString());
  if (params.subtotalFrom !== undefined) urlParams.set('subtotalFrom', params.subtotalFrom.toString());
  if (params.subtotalTo !== undefined) urlParams.set('subtotalTo', params.subtotalTo.toString());
  if (params.tax !== undefined) urlParams.set('tax', params.tax.toString());
  if (params.taxFrom !== undefined) urlParams.set('taxFrom', params.taxFrom.toString());
  if (params.taxTo !== undefined) urlParams.set('taxTo', params.taxTo.toString());
  if (params.total !== undefined) urlParams.set('total', params.total.toString());
  if (params.totalFrom !== undefined) urlParams.set('totalFrom', params.totalFrom.toString());
  if (params.totalTo !== undefined) urlParams.set('totalTo', params.totalTo.toString());
  if (params.homeSubtotal !== undefined) urlParams.set('homeSubtotal', params.homeSubtotal.toString());
  if (params.homeSubtotalFrom !== undefined) urlParams.set('homeSubtotalFrom', params.homeSubtotalFrom.toString());
  if (params.homeSubtotalTo !== undefined) urlParams.set('homeSubtotalTo', params.homeSubtotalTo.toString());
  if (params.homeTax !== undefined) urlParams.set('homeTax', params.homeTax.toString());
  if (params.homeTaxFrom !== undefined) urlParams.set('homeTaxFrom', params.homeTaxFrom.toString());
  if (params.homeTaxTo !== undefined) urlParams.set('homeTaxTo', params.homeTaxTo.toString());
  if (params.homeTotal !== undefined) urlParams.set('homeTotal', params.homeTotal.toString());
  if (params.homeTotalFrom !== undefined) urlParams.set('homeTotalFrom', params.homeTotalFrom.toString());
  if (params.homeTotalTo !== undefined) urlParams.set('homeTotalTo', params.homeTotalTo.toString());

  const queryString = urlParams.toString();
  return queryString ? `/processing?${queryString}` : '/processing';
}

/** Merges filter changes into the current params, going back to page 1 unless a page is given. */
export function applyProcessingFilters(
  prev: ProcessingDocumentSearchParams,
  filters: Partial<ProcessingFilterValues>,
): ProcessingDocumentSearchParams {
  // Convert AmountFilterValue to flat params
  const convertAmountFilter = (filter?: AmountFilterValue) => {
    if (!filter) return { single: undefined, from: undefined, to: undefined };
    if (filter.mode === 'single') return { single: filter.single, from: undefined, to: undefined };
    return { single: undefined, from: filter.range?.from, to: filter.range?.to };
  };

  // Only convert amount filters if they are provided in the filters object
  const subtotal = 'subtotalFilter' in filters ? convertAmountFilter(filters.subtotalFilter) : undefined;
  const tax = 'taxFilter' in filters ? convertAmountFilter(filters.taxFilter) : undefined;
  const total = 'totalFilter' in filters ? convertAmountFilter(filters.totalFilter) : undefined;
  const homeSubtotal = 'homeSubtotalFilter' in filters ? convertAmountFilter(filters.homeSubtotalFilter) : undefined;
  const homeTax = 'homeTaxFilter' in filters ? convertAmountFilter(filters.homeTaxFilter) : undefined;
  const homeTotal = 'homeTotalFilter' in filters ? convertAmountFilter(filters.homeTotalFilter) : undefined;

  return {
    // Handle pagination - use provided values or defaults
    page: 'page' in filters ? filters.page ?? 1 : 1, // Reset to first page on filter change unless explicitly provided
    limit: 'limit' in filters ? filters.limit ?? prev.limit : prev.limit,
    sortBy: prev.sortBy,
    sortOrder: prev.sortOrder,
    // Merge new filter values with previous values (only update if provided)
    pipelineStatus: 'pipelineStatus' in filters ? filters.pipelineStatus : prev.pipelineStatus,
    duplicateStatus: 'duplicateStatus' in filters ? filters.duplicateStatus : prev.duplicateStatus,
    revisionStatus: 'revisionStatus' in filters ? filters.revisionStatus : prev.revisionStatus,
    needsReview: 'needsReview' in filters ? filters.needsReview : prev.needsReview,
    isContainer: 'isContainer' in filters ? filters.isContainer : prev.isContainer,
    companyId: 'companyId' in filters ? filters.companyId : prev.companyId,
    uploadDatePreset: 'uploadDatePreset' in filters ? filters.uploadDatePreset : prev.uploadDatePreset,
    uploadDateFrom: 'uploadDateFrom' in filters ? filters.uploadDateFrom : prev.uploadDateFrom,
    uploadDateTo: 'uploadDateTo' in filters ? filters.uploadDateTo : prev.uploadDateTo,
    documentDateFrom: 'documentDateFrom' in filters ? filters.documentDateFrom : prev.documentDateFrom,
    documentDateTo: 'documentDateTo' in filters ? filters.documentDateTo : prev.documentDateTo,
    vendorName: 'vendorName' in filters ? filters.vendorName : prev.vendorName,
    documentNumber: 'documentNumber' in filters ? filters.documentNumber : prev.documentNumber,
    fileName: 'fileName' in filters ? filters.fileName : prev.fileName,
    documentCategory: 'documentCategory' in filters ? filters.documentCategory : prev.documentCategory,
    documentSubCategory: 'documentSubCategory' in filters ? filters.documentSubCategory : prev.documentSubCategory,
    // Tag filter
    tagIds: 'tagIds' in filters ? filters.tagIds : prev.tagIds,
    // Currency filters
    currency: 'currency' in filters ? filters.currency : prev.currency,
    homeCurrency: 'homeCurrency' in filters ? filters.homeCurrency : prev.homeCurrency,
    // Amount filters - only update if provided
    subtotal: subtotal !== undefined ? subtotal.single : prev.subtotal,
    subtotalFrom: subtotal !== undefined ? subtotal.from : prev.subtotalFrom,
    subtotalTo: subtotal !== undefined ? subtotal.to : prev.subtotalTo,
    tax: tax !== undefined ? tax.single : prev.tax,
    taxFrom: tax !== undefined ? tax.from : prev.taxFrom,
    taxTo: tax !== undefined ? tax.to : prev.taxTo,
    total: total !== undefined ? total.single : prev.total,
    totalFrom: total !== undefined ? total.from : prev.totalFrom,
    totalTo: total !== undefined ? total.to : prev.totalTo,
    homeSubtotal: homeSubtotal !== undefined ? homeSubtotal.single : prev.homeSubtotal,
    homeSubtotalFrom: homeSubtotal !== undefined ? homeSubtotal.from : prev.homeSubtotalFrom,
    homeSubtotalTo: homeSubtotal !== undefined ? homeSubtotal.to : prev.homeSubtotalTo,
    homeTax: homeTax !== undefined ? homeTax.single : prev.homeTax,
    homeTaxFrom: homeTax !== undefined ? homeTax.from : prev.homeTaxFrom,
    homeTaxTo: homeTax !== undefined ? homeTax.to : prev.homeTaxTo,
    homeTotal: homeTotal !== undefined ? homeTotal.single : prev.homeTotal,
    homeTotalFrom: homeTotal !== undefined ? homeTotal.from : prev.homeTotalFrom,
    homeTotalTo: homeTotal !== undefined ? homeTotal.to : prev.homeTotalTo,
    // Keep search separate (handled by handleSearchChange)
    search: prev.search,
  };
}
