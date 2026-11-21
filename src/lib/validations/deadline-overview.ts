import { z } from 'zod';
import { ValidationError } from '@/lib/errors';

/** Statutory filing families shown in the FY/YA matrix. */
export const COMPLIANCE_MATRIX_CODES = [
  'SG_ECI',
  'SG_FORM_C',
  'SG_AGM_DUE',
  'SG_ANNUAL_RETURN',
] as const;

export const COMPLIANCE_MATRIX_LABELS: Record<(typeof COMPLIANCE_MATRIX_CODES)[number], string> = {
  SG_ECI: 'ECI',
  SG_FORM_C: 'Form C',
  SG_AGM_DUE: 'AGM',
  SG_ANNUAL_RETURN: 'AR',
};

export const complianceOverviewStatusSchema = z.enum([
  'ALL',
  'PENDING_FILING',
  'TO_BE_CONFIRMED',
  'FILED',
  'MANAGED_EXTERNALLY',
  'NOT_REQUIRED',
  'NO_RECORD',
  'OVERDUE',
]);
export type ComplianceOverviewStatus = z.infer<typeof complianceOverviewStatusSchema>;
export type ComplianceMatrixCode = (typeof COMPLIANCE_MATRIX_CODES)[number];

export const complianceOverviewQuerySchema = z.object({
  overview: z.enum(['MATRIX', 'WORKLOAD']),
  year: z.number().int().min(2000).max(2100),
  matrixSortYear: z.number().int().min(2000).max(2100).optional(),
  matrixSortCode: z.enum(COMPLIANCE_MATRIX_CODES).optional(),
  matrixSortOrder: z.enum(['asc', 'desc']).default('asc'),
  financialYear: z.number().int().min(2000).max(2100).optional(),
  serviceCode: z.enum(COMPLIANCE_MATRIX_CODES).optional(),
  status: complianceOverviewStatusSchema.default('ALL'),
  companyQuery: z.string().trim().max(200).default(''),
  page: z.number().int().min(1).max(10000).default(1),
}).strict().superRefine((value, ctx) => {
  if (value.overview === 'MATRIX' && value.year === 2100) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['year'], message: 'Matrix requires room for two consecutive financial years' });
  }
  if ((value.matrixSortYear === undefined) !== (value.matrixSortCode === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['matrixSortYear'], message: 'Choose a financial year and filing together to sort' });
  }
  if (value.overview === 'MATRIX' && value.matrixSortYear !== undefined
      && value.matrixSortYear !== value.year && value.matrixSortYear !== value.year + 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['matrixSortYear'], message: 'Sort year must be one of the two displayed years' });
  }
  if (value.overview === 'WORKLOAD' && value.status === 'NO_RECORD') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'No-record filtering is only available in the matrix' });
  }
});

export type ComplianceOverviewQuery = z.infer<typeof complianceOverviewQuerySchema>;
export type ComplianceOverviewInput = Partial<Omit<ComplianceOverviewQuery, 'overview' | 'year'>> &
  Pick<ComplianceOverviewQuery, 'overview' | 'year'>;

export type MatrixFilingStatus = Exclude<ComplianceOverviewStatus, 'ALL' | 'NO_RECORD' | 'OVERDUE'> | 'CANCELLED';

export type ComplianceMatrixCell = {
  deadlineId: string;
  dueDate: string;
  status: MatrixFilingStatus;
  overdue: boolean;
  occurrenceCount: number;
};

export type ComplianceMatrixRow = {
  companyId: string;
  companyName: string;
  displayLabel: string;
  cellsByYear: Record<number, Partial<Record<ComplianceMatrixCode, ComplianceMatrixCell>>>;
};

export type ComplianceMatrixResult = {
  overview: 'MATRIX';
  financialYear: number;
  years: [number, number];
  columns: ComplianceMatrixCode[];
  rows: ComplianceMatrixRow[];
  totalCompanies: number;
  page: number;
  totalPages: number;
};

export type MonthlyWorkloadCounts = {
  total: number;
  pending: number;
  toConfirm: number;
  filed: number;
  managedExternally: number;
  notRequired: number;
  overdue: number;
};

export type ComplianceWorkloadMonth = MonthlyWorkloadCounts & { month: string };
export type ComplianceWorkloadResult = {
  overview: 'WORKLOAD';
  dueYear: number;
  months: ComplianceWorkloadMonth[];
  totals: MonthlyWorkloadCounts;
  services: Array<{ code: ComplianceMatrixCode | 'OTHER'; label: string; counts: MonthlyWorkloadCounts }>;
};

export type ComplianceOverviewResult = ComplianceMatrixResult | ComplianceWorkloadResult;

function parseYear(value: string, key: string): number {
  if (!/^\d{4}$/.test(value)) throw new ValidationError('Invalid ' + key + '; expected four-digit year');
  return Number(value);
}

function parsePage(value: string): number {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new ValidationError('Invalid overview page');
  }
  return Number(value);
}

export function parseComplianceOverviewParams(params: URLSearchParams): ComplianceOverviewQuery {
  const allowed = new Set(['overview', 'year', 'financialYear', 'serviceCode', 'status', 'companyQuery', 'page', 'matrixSortYear', 'matrixSortCode', 'matrixSortOrder']);
  const raw: Record<string, unknown> = {};
  for (const [key, value] of params) {
    if (!allowed.has(key)) throw new ValidationError('Unknown overview parameter: ' + key);
    if (Object.prototype.hasOwnProperty.call(raw, key)) throw new ValidationError('Duplicate overview parameter: ' + key);
    raw[key] = key === 'year' || key === 'financialYear' || key === 'matrixSortYear' ? parseYear(value, key) : key === 'page' ? parsePage(value) : value;
  }
  const result = complianceOverviewQuerySchema.safeParse(raw);
  if (!result.success) throw new ValidationError('Invalid compliance overview query', { issues: result.error.issues });
  return result.data;
}

export function complianceOverviewParams(input: ComplianceOverviewInput): string {
  const parsed = complianceOverviewQuerySchema.parse(input);
  const params = new URLSearchParams();
  params.set('overview', parsed.overview);
  params.set('year', String(parsed.year));
  if (parsed.matrixSortYear !== undefined) params.set('matrixSortYear', String(parsed.matrixSortYear));
  if (parsed.matrixSortCode) params.set('matrixSortCode', parsed.matrixSortCode);
  if (parsed.matrixSortCode && parsed.matrixSortOrder !== 'asc') params.set('matrixSortOrder', parsed.matrixSortOrder);
  if (parsed.financialYear !== undefined) params.set('financialYear', String(parsed.financialYear));
  if (parsed.serviceCode) params.set('serviceCode', parsed.serviceCode);
  if (parsed.status !== 'ALL') params.set('status', parsed.status);
  if (parsed.companyQuery) params.set('companyQuery', parsed.companyQuery);
  if (parsed.page > 1) params.set('page', String(parsed.page));
  params.sort();
  return params.toString();
}
