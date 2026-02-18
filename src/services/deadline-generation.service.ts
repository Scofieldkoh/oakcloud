/**
 * Deadline Generation Service
 *
 * Handles automatic generation of deadlines based on templates,
 * company characteristics, and service agreements.
 */

import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import type {
  Company,
  ContractService,
  DeadlineTemplate,
  DeadlineCategory,
  DeadlineAnchorType,
  DeadlineFrequency,
  EntityType,
  GstFilingFrequency,
  Prisma,
  PrismaClient,
} from '@/generated/prisma';
import { ALL_DEADLINE_TEMPLATES, type DeadlineTemplateData } from '@/lib/constants/deadline-templates';
import type { DeadlineRule, DeadlineRuleType } from '@/generated/prisma';
import type { DeadlineExclusionInput, DeadlineRuleInput } from '@/lib/validations/service';

/**
 * Type for Prisma transaction client
 */
export type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export interface TenantAwareParams {
  tenantId: string;
  userId: string;
  tx?: PrismaTransactionClient;
}

// ============================================================================
// TYPES
// ============================================================================

interface CompanyDeadlineContext {
  company: Company;
  fyeMonth: number | null;
  fyeDay: number | null;
  incorporationDate: Date | null;
  isGstRegistered: boolean;
  gstFilingFrequency: GstFilingFrequency | null;
  isRegisteredCharity: boolean;
  isIPC: boolean;
  ipcExpiryDate: Date | null;
  agmDispensed: boolean;
  isDormant: boolean;
  dormantTaxExemptionApproved: boolean;
  requiresAudit: boolean;
  entityType: EntityType;
}

interface ServiceContext {
  service: ContractService;
  serviceStartDate: Date;
  gstFilingFrequency: GstFilingFrequency | null;
}

interface GeneratedDeadline {
  title: string;
  description: string | null;
  category: DeadlineCategory;
  referenceCode: string | null;
  periodLabel: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  statutoryDueDate: Date;
  isBillable: boolean;
  amount: number | null;
  currency: string;
  templateCode: string;
}

export interface PreviewDeadlinesResult {
  deadlines: GeneratedDeadline[];
  warnings: string[];
}

function normalizeDeadlineTaskName(taskName: string): string {
  return taskName.trim().toLowerCase();
}

function normalizeDeadlineDateKey(dateInput: string | Date): string | null {
  const parsed = new Date(dateInput);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split('T')[0];
}

function buildExcludedDeadlineKey(taskName: string, statutoryDueDate: string | Date): string | null {
  const normalizedTask = normalizeDeadlineTaskName(taskName);
  if (!normalizedTask) return null;
  const normalizedDate = normalizeDeadlineDateKey(statutoryDueDate);
  if (!normalizedDate) return null;
  return `${normalizedTask}|${normalizedDate}`;
}

function createExcludedDeadlineKeySet(excludedDeadlines?: DeadlineExclusionInput[] | null): Set<string> {
  const keys = new Set<string>();
  (excludedDeadlines || []).forEach((item) => {
    const key = buildExcludedDeadlineKey(item.taskName, item.statutoryDueDate);
    if (key) {
      keys.add(key);
    }
  });
  return keys;
}

// ============================================================================
// TEMPLATE APPLICABILITY CHECKS
// ============================================================================

/**
 * Check if a template applies to a company based on its characteristics
 */
function templateAppliesToCompany(
  template: DeadlineTemplateData,
  context: CompanyDeadlineContext
): boolean {
  // Check entity type requirements
  if (template.entityTypes && template.entityTypes.length > 0) {
    if (!template.entityTypes.includes(context.entityType)) {
      return false;
    }
  }

  // Check entity type exclusions
  if (template.excludeEntityTypes && template.excludeEntityTypes.length > 0) {
    if (template.excludeEntityTypes.includes(context.entityType)) {
      return false;
    }
  }

  // Check GST registration requirement
  if (template.requiresGstRegistered === true && !context.isGstRegistered) {
    return false;
  }
  if (template.requiresGstRegistered === false && context.isGstRegistered) {
    return false;
  }

  // Check audit requirement
  if (template.requiresAudit === true && !context.requiresAudit) {
    return false;
  }

  // Check charity status requirement
  if (template.requiresCharityStatus === true && !context.isRegisteredCharity) {
    return false;
  }

  // Check IPC status requirement
  if (template.requiresIPCStatus === true && !context.isIPC) {
    return false;
  }

  // Check tax filing exemption for dormant companies
  if (template.isTaxFiling && context.dormantTaxExemptionApproved) {
    return false;
  }

  // Special case: AGM template - skip if company has dispensed with AGMs
  if (template.code === 'AGM' && context.agmDispensed) {
    return false;
  }

  // Special case: GST templates - check filing frequency
  if (template.code === 'GST_RETURN_Q' && context.gstFilingFrequency !== 'QUARTERLY') {
    return false;
  }
  if (template.code === 'GST_RETURN_M' && context.gstFilingFrequency !== 'MONTHLY') {
    return false;
  }

  return true;
}

// ============================================================================
// DATE CALCULATION
// ============================================================================

/**
 * Get the anchor date based on anchor type
 */
function getAnchorDate(
  anchorType: DeadlineAnchorType,
  context: CompanyDeadlineContext,
  serviceContext: ServiceContext | null,
  periodYear: number,
  periodQuarter?: number,
  periodMonth?: number
): Date | null {
  const year = periodYear;

  switch (anchorType) {
    case 'FYE': {
      // Financial Year End
      if (!context.fyeMonth) return null;
      const fyeMonth = context.fyeMonth - 1; // 0-indexed
      const fyeDay = context.fyeDay || getLastDayOfMonth(year, fyeMonth);
      return new Date(year, fyeMonth, fyeDay);
    }

    case 'SERVICE_START': {
      // Service start anniversary
      if (!serviceContext) return null;
      const startDate = serviceContext.serviceStartDate;
      return new Date(year, startDate.getMonth(), startDate.getDate());
    }

    case 'FIXED_CALENDAR': {
      // Fixed calendar date - will use fixedMonth/fixedDay from template
      return null; // Handled specially in calculateDueDate
    }

    case 'QUARTER_END': {
      // End of calendar quarter
      if (periodQuarter === undefined) return null;
      const quarterEndMonths = [2, 5, 8, 11]; // Mar, Jun, Sep, Dec (0-indexed)
      const endMonth = quarterEndMonths[periodQuarter - 1];
      const endDay = getLastDayOfMonth(year, endMonth);
      return new Date(year, endMonth, endDay);
    }

    case 'MONTH_END': {
      // End of month
      if (periodMonth === undefined) return null;
      const monthIndex = periodMonth - 1; // 0-indexed
      const endDay = getLastDayOfMonth(year, monthIndex);
      return new Date(year, monthIndex, endDay);
    }

    case 'INCORPORATION': {
      // Incorporation date anniversary
      if (!context.incorporationDate) return null;
      const incDate = context.incorporationDate;
      return new Date(year, incDate.getMonth(), incDate.getDate());
    }

    case 'IPC_EXPIRY': {
      // IPC expiry date
      return context.ipcExpiryDate;
    }

    default:
      return null;
  }
}

/**
 * Calculate the due date from anchor date and template offsets
 */
function calculateDueDate(
  template: DeadlineTemplateData,
  anchorDate: Date | null,
  year: number
): Date {
  // For FIXED_CALENDAR, use fixed month/day
  if (template.anchorType === 'FIXED_CALENDAR') {
    const month = (template.fixedMonth || 1) - 1; // 0-indexed
    const day = template.fixedDay || 1;
    return new Date(year, month, day);
  }

  if (!anchorDate) {
    throw new Error(`Cannot calculate due date: no anchor date for ${template.code}`);
  }

  // Apply month offset (clamp to end-of-month if needed)
  let dueDate = addMonthsClamped(anchorDate, template.offsetMonths);

  // Apply day offset
  if (template.offsetBusinessDays) {
    dueDate = addBusinessDays(dueDate, template.offsetDays);
  } else {
    dueDate.setDate(dueDate.getDate() + template.offsetDays);
  }

  return dueDate;
}

/**
 * Add business days to a date (skipping weekends)
 */
function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let remaining = Math.abs(days);
  const direction = days >= 0 ? 1 : -1;

  while (remaining > 0) {
    result.setDate(result.getDate() + direction);
    const dayOfWeek = result.getDay();
    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      remaining--;
    }
  }

  return result;
}

/**
 * Get the last day of a month
 */
function getLastDayOfMonth(year: number, month: number): number {
  // Month is 0-indexed, so month + 1 is next month, day 0 is last day of current month
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Add months to a date while clamping to the last day of target month if needed.
 */
function addMonthsClamped(date: Date, months: number): Date {
  const year = date.getFullYear();
  const monthIndex = date.getMonth();
  const day = date.getDate();
  const targetIndex = monthIndex + months;
  const targetYear = year + Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12;
  const lastDay = getLastDayOfMonth(targetYear, targetMonth);
  const safeDay = Math.min(day, lastDay);
  return new Date(targetYear, targetMonth, safeDay);
}

// ============================================================================
// PERIOD LABEL GENERATION
// ============================================================================

/**
 * Generate period label for a deadline
 */
function generatePeriodLabel(
  template: DeadlineTemplateData,
  year: number,
  quarter?: number,
  month?: number
): string {
  switch (template.frequency) {
    case 'ANNUALLY':
      if (template.anchorType === 'FYE') {
        return `FY${year}`;
      }
      if (template.code === 'CORP_TAX') {
        return `YA${year + 1}`; // Year of Assessment is FYE year + 1
      }
      return `${year}`;

    case 'QUARTERLY':
      return `Q${quarter} ${year}`;

    case 'MONTHLY':
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                         'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${monthNames[month! - 1]} ${year}`;

    case 'ONE_TIME':
      return `${year}`;

    default:
      return `${year}`;
  }
}

/**
 * Generate reference code for grouping related deadlines
 */
function generateReferenceCode(
  template: DeadlineTemplateData,
  year: number,
  quarter?: number,
  month?: number
): string {
  const baseCode = template.code;

  switch (template.frequency) {
    case 'ANNUALLY':
      return `${baseCode}-${year}`;
    case 'QUARTERLY':
      return `${baseCode}-${year}-Q${quarter}`;
    case 'MONTHLY':
      const monthStr = String(month).padStart(2, '0');
      return `${baseCode}-${year}-${monthStr}`;
    default:
      return `${baseCode}-${year}`;
  }
}

// ============================================================================
// DEADLINE GENERATION
// ============================================================================

/**
 * Generate deadlines for a company based on templates
 */
export async function generateDeadlinesForCompany(
  companyId: string,
  params: TenantAwareParams,
  options?: {
    templateCodes?: string[]; // Specific templates to generate
    monthsAhead?: number;
    serviceId?: string; // Link to specific service
  }
): Promise<{ created: number; skipped: number }> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;
  const monthsAhead = options?.monthsAhead ?? 18;

  // Fetch company with all relevant data
  const company = await db.company.findFirst({
    where: { id: companyId, tenantId, deletedAt: null },
  });

  if (!company) {
    throw new Error('Company not found');
  }

  // Build company context
  const context: CompanyDeadlineContext = {
    company,
    fyeMonth: company.financialYearEndMonth,
    fyeDay: company.financialYearEndDay,
    incorporationDate: company.incorporationDate,
    isGstRegistered: company.isGstRegistered,
    gstFilingFrequency: company.gstFilingFrequency as GstFilingFrequency | null,
    isRegisteredCharity: company.isRegisteredCharity,
    isIPC: company.isIPC,
    ipcExpiryDate: company.ipcExpiryDate,
    agmDispensed: company.agmDispensed,
    isDormant: company.isDormant,
    dormantTaxExemptionApproved: company.dormantTaxExemptionApproved,
    requiresAudit: determineAuditRequirement(company),
    entityType: company.entityType,
  };

  // Get service context if serviceId provided
  let serviceContext: ServiceContext | null = null;
  if (options?.serviceId) {
    const service = await db.contractService.findFirst({
      where: { id: options.serviceId, tenantId, deletedAt: null },
    });
    if (service) {
      serviceContext = {
        service,
        serviceStartDate: service.startDate,
        gstFilingFrequency: service.gstFilingFrequency as GstFilingFrequency | null,
      };
    }
  }

  // Filter templates
  let templates = ALL_DEADLINE_TEMPLATES;
  if (options?.templateCodes && options.templateCodes.length > 0) {
    templates = templates.filter(t => options.templateCodes!.includes(t.code));
  }

  // Generate deadlines
  const now = new Date();
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + monthsAhead);

  let created = 0;
  let skipped = 0;

  // Fetch all existing deadlines for this company upfront to avoid N+1 queries
  const existingDeadlines = await db.deadline.findMany({
    where: {
      tenantId,
      companyId,
      deletedAt: null,
    },
    select: {
      periodLabel: true,
      referenceCode: true,
    },
  });

  // Create a Set for fast lookup of existing deadline keys
  const existingDeadlineKeys = new Set(
    existingDeadlines.map(d => `${d.periodLabel}|${d.referenceCode || ''}`)
  );

  // Collect all deadlines to create
  const deadlinesToCreate: Array<{
    tenantId: string;
    companyId: string;
    contractServiceId: string | null;
    deadlineTemplateId: string | null;
    title: string;
    description: string | null;
    category: DeadlineCategory;
    referenceCode: string | null;
    periodLabel: string;
    periodStart: Date | null;
    periodEnd: Date | null;
    statutoryDueDate: Date;
    status: 'PENDING';
    isBillable: boolean;
    billingStatus: 'NOT_APPLICABLE' | 'PENDING';
    amount: number | null;
    currency: string;
    generationType: 'AUTO';
  }> = [];

  for (const template of templates) {
    // Check if template applies to this company
    if (!templateAppliesToCompany(template, context)) {
      continue;
    }

    // Generate deadlines based on frequency
    const deadlines = generateDeadlinesFromTemplate(
      template,
      context,
      serviceContext,
      now,
      endDate
    );

    for (const deadlineData of deadlines) {
      // Check if deadline already exists using the pre-fetched set
      const key = `${deadlineData.periodLabel}|${deadlineData.referenceCode || ''}`;
      if (existingDeadlineKeys.has(key)) {
        skipped++;
        continue;
      }

      // Add to list of deadlines to create
      deadlinesToCreate.push({
        tenantId,
        companyId,
        contractServiceId: options?.serviceId || null,
        deadlineTemplateId: null,
        title: deadlineData.title,
        description: deadlineData.description,
        category: deadlineData.category,
        referenceCode: deadlineData.referenceCode,
        periodLabel: deadlineData.periodLabel,
        periodStart: deadlineData.periodStart,
        periodEnd: deadlineData.periodEnd,
        statutoryDueDate: deadlineData.statutoryDueDate,
        status: 'PENDING',
        isBillable: deadlineData.isBillable,
        billingStatus: deadlineData.isBillable ? 'PENDING' : 'NOT_APPLICABLE',
        amount: deadlineData.amount,
        currency: 'SGD',
        generationType: 'AUTO',
      });

      // Add to set to prevent duplicates within the same batch
      existingDeadlineKeys.add(key);
    }
  }

  // Batch create all deadlines at once for better performance
  if (deadlinesToCreate.length > 0) {
    await db.deadline.createMany({
      data: deadlinesToCreate,
    });
    created = deadlinesToCreate.length;
  }

  // Create audit log
  if (created > 0) {
    await createAuditLog({
      tenantId,
      userId,
      companyId,
      action: 'CREATE',
      entityType: 'Deadline',
      entityId: companyId,
      summary: `Auto-generated ${created} deadlines for ${company.name}`,
      changeSource: 'SYSTEM',
      metadata: {
        created,
        skipped,
        monthsAhead,
      },
    });
  }

  return { created, skipped };
}

/**
 * Generate deadline instances from a template within a date range
 */
function generateDeadlinesFromTemplate(
  template: DeadlineTemplateData,
  context: CompanyDeadlineContext,
  serviceContext: ServiceContext | null,
  startDate: Date,
  endDate: Date
): GeneratedDeadline[] {
  const deadlines: GeneratedDeadline[] = [];
  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();

  switch (template.frequency) {
    case 'ANNUALLY': {
      for (let year = startYear; year <= endYear; year++) {
        try {
          const anchorDate = getAnchorDate(
            template.anchorType,
            context,
            serviceContext,
            year
          );
          const dueDate = calculateDueDate(template, anchorDate, year);

          // Check if due date is within range
          if (dueDate >= startDate && dueDate <= endDate) {
            const periodLabel = generatePeriodLabel(template, year);
            const referenceCode = generateReferenceCode(template, year);

            deadlines.push({
              title: `${template.name} - ${periodLabel}`,
              description: template.description,
              category: template.category,
              referenceCode,
              periodLabel,
              periodStart: anchorDate ? getPeriodStart(anchorDate, 'ANNUALLY') : null,
              periodEnd: anchorDate,
              statutoryDueDate: dueDate,
              isBillable: template.isBillable,
              currency: 'SGD',
              amount: template.defaultAmount,
              templateCode: template.code,
            });
          }
        } catch {
          // Skip if can't calculate date (e.g., missing FYE)
          continue;
        }
      }
      break;
    }

    case 'QUARTERLY': {
      for (let year = startYear; year <= endYear; year++) {
        for (let quarter = 1; quarter <= 4; quarter++) {
          try {
            const anchorDate = getAnchorDate(
              template.anchorType,
              context,
              serviceContext,
              year,
              quarter
            );
            const dueDate = calculateDueDate(template, anchorDate, year);

            if (dueDate >= startDate && dueDate <= endDate) {
              const periodLabel = generatePeriodLabel(template, year, quarter);
              const referenceCode = generateReferenceCode(template, year, quarter);

              deadlines.push({
                title: `${template.name} - ${periodLabel}`,
                description: template.description,
                category: template.category,
                referenceCode,
                periodLabel,
                periodStart: getQuarterStart(year, quarter),
                periodEnd: anchorDate,
                statutoryDueDate: dueDate,
                isBillable: template.isBillable,
              currency: 'SGD',
                amount: template.defaultAmount,
                templateCode: template.code,
              });
            }
          } catch {
            continue;
          }
        }
      }
      break;
    }

    case 'MONTHLY': {
      for (let year = startYear; year <= endYear; year++) {
        for (let month = 1; month <= 12; month++) {
          try {
            const anchorDate = getAnchorDate(
              template.anchorType,
              context,
              serviceContext,
              year,
              undefined,
              month
            );
            const dueDate = calculateDueDate(template, anchorDate, year);

            if (dueDate >= startDate && dueDate <= endDate) {
              const periodLabel = generatePeriodLabel(template, year, undefined, month);
              const referenceCode = generateReferenceCode(template, year, undefined, month);

              deadlines.push({
                title: `${template.name} - ${periodLabel}`,
                description: template.description,
                category: template.category,
                referenceCode,
                periodLabel,
                periodStart: new Date(year, month - 1, 1),
                periodEnd: anchorDate,
                statutoryDueDate: dueDate,
                isBillable: template.isBillable,
              currency: 'SGD',
                amount: template.defaultAmount,
                templateCode: template.code,
              });
            }
          } catch {
            continue;
          }
        }
      }
      break;
    }

    case 'ONE_TIME': {
      // One-time deadlines like IPC renewal
      try {
        const anchorDate = getAnchorDate(
          template.anchorType,
          context,
          serviceContext,
          startYear
        );
        if (anchorDate) {
          const dueDate = calculateDueDate(template, anchorDate, anchorDate.getFullYear());

          if (dueDate >= startDate && dueDate <= endDate) {
            const year = dueDate.getFullYear();
            const periodLabel = generatePeriodLabel(template, year);
            const referenceCode = generateReferenceCode(template, year);

            deadlines.push({
              title: `${template.name} - ${periodLabel}`,
              description: template.description,
              category: template.category,
              referenceCode,
              periodLabel,
              periodStart: null,
              periodEnd: anchorDate,
              statutoryDueDate: dueDate,
              isBillable: template.isBillable,
              currency: 'SGD',
              amount: template.defaultAmount,
              templateCode: template.code,
            });
          }
        }
      } catch {
        // Skip
      }
      break;
    }
  }

  return deadlines;
}

/**
 * Get period start date for annual deadlines (one year before period end)
 */
function getPeriodStart(periodEnd: Date, frequency: DeadlineFrequency): Date | null {
  if (frequency === 'ANNUALLY') {
    const start = new Date(periodEnd);
    start.setFullYear(start.getFullYear() - 1);
    start.setDate(start.getDate() + 1);
    return start;
  }
  return null;
}

/**
 * Get quarter start date
 */
function getQuarterStart(year: number, quarter: number): Date {
  const quarterStartMonths = [0, 3, 6, 9]; // Jan, Apr, Jul, Oct (0-indexed)
  return new Date(year, quarterStartMonths[quarter - 1], 1);
}

/**
 * Determine if company requires audit (simplified logic)
 */
function determineAuditRequirement(company: Company): boolean {
  // Public companies and CLGs always require audit
  if (company.entityType === 'PUBLIC_LIMITED' ||
      company.entityType === 'PUBLIC_COMPANY_LIMITED_BY_GUARANTEE') {
    return true;
  }

  // IPCs require audit
  if (company.isIPC) {
    return true;
  }

  // Small company exemption check would go here
  // For now, default to not requiring audit for private companies
  return false;
}

// ============================================================================
// BATCH GENERATION
// ============================================================================

/**
 * Generate deadlines for all companies in a tenant
 */
export async function generateDeadlinesForTenant(
  params: TenantAwareParams,
  options?: {
    monthsAhead?: number;
  }
): Promise<{ totalCreated: number; totalSkipped: number; companiesProcessed: number }> {
  const { tenantId, userId } = params;

  // Get all active companies
  const companies = await prisma.company.findMany({
    where: { tenantId, deletedAt: null, status: 'LIVE' },
    select: { id: true, name: true },
  });

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const company of companies) {
    try {
      const result = await generateDeadlinesForCompany(
        company.id,
        params,
        { monthsAhead: options?.monthsAhead }
      );
      totalCreated += result.created;
      totalSkipped += result.skipped;
    } catch (error) {
      // Log error but continue with other companies
      console.error(`Error generating deadlines for company ${company.id}:`, error);
    }
  }

  // Create summary audit log
  await createAuditLog({
    tenantId,
    userId,
    action: 'BULK_UPDATE',
    entityType: 'Deadline',
    entityId: 'batch-generation',
    summary: `Batch generated ${totalCreated} deadlines across ${companies.length} companies`,
    changeSource: 'SYSTEM',
    metadata: {
      totalCreated,
      totalSkipped,
      companiesProcessed: companies.length,
    },
  });

  return {
    totalCreated,
    totalSkipped,
    companiesProcessed: companies.length,
  };
}

/**
 * Regenerate deadlines for a company (delete existing and recreate)
 */
export async function regenerateDeadlinesForCompany(
  companyId: string,
  params: TenantAwareParams,
  options?: {
    templateCodes?: string[];
    monthsAhead?: number;
    preserveManual?: boolean;
  }
): Promise<{ deleted: number; created: number }> {
  const { tenantId, userId } = params;
  const preserveManual = options?.preserveManual ?? true;

  return await prisma.$transaction(async (tx) => {
    // Delete existing auto-generated deadlines that are not completed
    const deleteWhere: Prisma.DeadlineWhereInput = {
      tenantId,
      companyId,
      generationType: 'AUTO',
      status: { in: ['PENDING', 'PENDING_CLIENT', 'IN_PROGRESS', 'PENDING_REVIEW'] },
      deletedAt: null,
    };

    if (options?.templateCodes && options.templateCodes.length > 0) {
      deleteWhere.referenceCode = {
        startsWith: options.templateCodes.length === 1
          ? options.templateCodes[0]
          : undefined,
      };
    }

    const deleteResult = await tx.deadline.updateMany({
      where: deleteWhere,
      data: { deletedAt: new Date() },
    });

    // Generate new deadlines
    const generateResult = await generateDeadlinesForCompany(
      companyId,
      { ...params, tx },
      {
        templateCodes: options?.templateCodes,
        monthsAhead: options?.monthsAhead,
      }
    );

    return {
      deleted: deleteResult.count,
      created: generateResult.created,
    };
  });
}

// ============================================================================
// TEMPLATE MANAGEMENT
// ============================================================================

/**
 * Get all available deadline templates
 */
export function getAllDeadlineTemplates(): DeadlineTemplateData[] {
  return ALL_DEADLINE_TEMPLATES;
}

/**
 * Get deadline templates applicable to a company
 */
export async function getApplicableTemplates(
  companyId: string,
  tenantId: string
): Promise<DeadlineTemplateData[]> {
  const company = await prisma.company.findFirst({
    where: { id: companyId, tenantId, deletedAt: null },
  });

  if (!company) {
    return [];
  }

  const context: CompanyDeadlineContext = {
    company,
    fyeMonth: company.financialYearEndMonth,
    fyeDay: company.financialYearEndDay,
    incorporationDate: company.incorporationDate,
    isGstRegistered: company.isGstRegistered,
    gstFilingFrequency: company.gstFilingFrequency as GstFilingFrequency | null,
    isRegisteredCharity: company.isRegisteredCharity,
    isIPC: company.isIPC,
    ipcExpiryDate: company.ipcExpiryDate,
    agmDispensed: company.agmDispensed,
    isDormant: company.isDormant,
    dormantTaxExemptionApproved: company.dormantTaxExemptionApproved,
    requiresAudit: determineAuditRequirement(company),
    entityType: company.entityType,
  };

  return ALL_DEADLINE_TEMPLATES.filter(t => templateAppliesToCompany(t, context));
}

/**
 * Seed system deadline templates into database
 */
export async function seedDeadlineTemplates(
  params: TenantAwareParams
): Promise<{ created: number; updated: number }> {
  const { tx } = params;
  const db = tx || prisma;

  let created = 0;
  let updated = 0;

  for (const template of ALL_DEADLINE_TEMPLATES) {
    const existing = await db.deadlineTemplate.findFirst({
      where: {
        tenantId: null, // System templates have null tenantId
        code: template.code,
        jurisdiction: template.jurisdiction,
      },
    });

    const data = {
      tenantId: null,
      code: template.code,
      name: template.name,
      category: template.category,
      jurisdiction: template.jurisdiction,
      description: template.description,
      entityTypes: template.entityTypes as unknown as Prisma.InputJsonValue,
      excludeEntityTypes: template.excludeEntityTypes as unknown as Prisma.InputJsonValue,
      requiresGstRegistered: template.requiresGstRegistered,
      requiresAudit: template.requiresAudit,
      isTaxFiling: template.isTaxFiling,
      requiresCharityStatus: template.requiresCharityStatus,
      requiresIPCStatus: template.requiresIPCStatus,
      anchorType: template.anchorType,
      offsetMonths: template.offsetMonths,
      offsetDays: template.offsetDays,
      offsetBusinessDays: template.offsetBusinessDays,
      fixedMonth: template.fixedMonth,
      fixedDay: template.fixedDay,
      frequency: template.frequency,
      generateMonthsAhead: template.generateMonthsAhead,
      isOptional: template.isOptional,
      optionalNote: template.optionalNote,
      isBillable: template.isBillable,
              currency: 'SGD',
      defaultAmount: template.defaultAmount,
      reminderDaysBefore: template.reminderDaysBefore as unknown as Prisma.InputJsonValue,
      isActive: true,
    };

    if (existing) {
      await db.deadlineTemplate.update({
        where: { id: existing.id },
        data,
      });
      updated++;
    } else {
      await db.deadlineTemplate.create({ data });
      created++;
    }
  }

  return { created, updated };
}

// ============================================================================
// DEADLINE GENERATION FROM RULES (NEW)
// ============================================================================

/**
 * Generate deadlines from DeadlineRule records for a contract service
 */
export async function generateDeadlinesFromRules(
  contractServiceId: string,
  companyId: string,
  params: TenantAwareParams,
  options?: {
    monthsAhead?: number;
    regenerate?: boolean; // Delete existing and recreate
    fyeYearOverride?: number;
    excludedDeadlines?: DeadlineExclusionInput[] | null;
  }
): Promise<{ created: number; skipped: number }> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;
  const monthsAhead = options?.monthsAhead ?? 18;

  // Fetch company data
  const company = await db.company.findFirst({
    where: { id: companyId, tenantId, deletedAt: null },
  });

  if (!company) {
    throw new Error('Company not found');
  }

  // Fetch contract service
  const service = await db.contractService.findFirst({
    where: { id: contractServiceId, tenantId, deletedAt: null },
  });

  if (!service) {
    throw new Error('Contract service not found');
  }

  // Fetch deadline rules for this service
  const rules = await db.deadlineRule.findMany({
    where: {
      contractServiceId,
      tenantId,
      deletedAt: null,
    },
    orderBy: {
      displayOrder: 'asc',
    },
  });

  if (rules.length === 0) {
    return { created: 0, skipped: 0 };
  }

  // Build company context
  const context: CompanyDeadlineContext = {
    company,
    fyeMonth: company.financialYearEndMonth,
    fyeDay: company.financialYearEndDay,
    incorporationDate: company.incorporationDate,
    isGstRegistered: company.isGstRegistered,
    gstFilingFrequency: company.gstFilingFrequency as GstFilingFrequency | null,
    isRegisteredCharity: company.isRegisteredCharity,
    isIPC: company.isIPC,
    ipcExpiryDate: company.ipcExpiryDate,
    agmDispensed: company.agmDispensed,
    isDormant: company.isDormant,
    dormantTaxExemptionApproved: company.dormantTaxExemptionApproved,
    requiresAudit: determineAuditRequirement(company),
    entityType: company.entityType,
  };

  // Service context
  const serviceContext: ServiceContext = {
    service,
    serviceStartDate: service.startDate,
    gstFilingFrequency: service.gstFilingFrequency as GstFilingFrequency | null,
  };

  // If regenerate, delete existing deadlines
  if (options?.regenerate) {
    await db.deadline.deleteMany({
      where: {
        contractServiceId,
        tenantId,
      },
    });
  }

  // Generate deadlines
  const now = new Date();
  const lookbackStart = new Date(now);
  lookbackStart.setMonth(lookbackStart.getMonth() - monthsAhead);

  // Keep the lookback window so one-time SERVICE_START rules with negative offsets
  // (e.g. "30 days before service start") are still generated.
  const generationStart = lookbackStart;

  const endDate = new Date(now);
  endDate.setMonth(endDate.getMonth() + monthsAhead);
  if (service.startDate && service.startDate > endDate) {
    const extendedEnd = new Date(service.startDate);
    extendedEnd.setMonth(extendedEnd.getMonth() + monthsAhead);
    if (extendedEnd > endDate) {
      endDate.setTime(extendedEnd.getTime());
    }
  }

  let created = 0;
  let skipped = 0;
  const excludedDeadlineKeys = createExcludedDeadlineKeySet(options?.excludedDeadlines);

  // Fetch existing deadlines for deduplication
  const existingDeadlines = await db.deadline.findMany({
    where: {
      tenantId,
      companyId,
      contractServiceId,
      deletedAt: null,
    },
    select: {
      periodLabel: true,
      referenceCode: true,
    },
  });

  const existingDeadlineKeys = new Set(
    existingDeadlines.map(d => `${d.periodLabel}|${d.referenceCode || ''}`)
  );

  // Collect deadlines to create
  const deadlinesToCreate: Array<{
    tenantId: string;
    companyId: string;
    contractServiceId: string;
    deadlineTemplateId: string | null;
    title: string;
    description: string | null;
    category: DeadlineCategory;
    referenceCode: string | null;
    periodLabel: string;
    periodStart: Date | null;
    periodEnd: Date | null;
    statutoryDueDate: Date;
    status: 'PENDING';
    isBillable: boolean;
    billingStatus: 'NOT_APPLICABLE' | 'PENDING';
    amount: number | null;
    currency: string;
    generationType: 'AUTO';
  }> = [];

  for (const rule of rules) {
    const ruleStartDate =
      options?.fyeYearOverride && rule.anchorType === 'FYE'
        ? new Date(options.fyeYearOverride, 0, 1)
        : generationStart;
    // Generate deadlines from this rule
    const deadlines = generateDeadlinesFromRule(
      rule,
      context,
      serviceContext,
      ruleStartDate,
      endDate
    );

    for (const deadlineData of deadlines) {
      const exclusionKey = buildExcludedDeadlineKey(
        deadlineData.title,
        deadlineData.statutoryDueDate
      );
      if (exclusionKey && excludedDeadlineKeys.has(exclusionKey)) {
        skipped++;
        continue;
      }

      // Check if deadline already exists
      const key = `${deadlineData.periodLabel}|${deadlineData.referenceCode || ''}`;
      if (existingDeadlineKeys.has(key)) {
        skipped++;
        continue;
      }

      deadlinesToCreate.push({
        tenantId,
        companyId,
        contractServiceId,
        deadlineTemplateId: null,
        title: deadlineData.title,
        description: deadlineData.description,
        category: deadlineData.category,
        referenceCode: deadlineData.referenceCode,
        periodLabel: deadlineData.periodLabel,
        periodStart: deadlineData.periodStart,
        periodEnd: deadlineData.periodEnd,
        statutoryDueDate: deadlineData.statutoryDueDate,
        status: 'PENDING',
        isBillable: deadlineData.isBillable,
        billingStatus: deadlineData.isBillable ? 'PENDING' : 'NOT_APPLICABLE',
        amount: deadlineData.amount,
        currency: deadlineData.currency || 'SGD',
        generationType: 'AUTO',
      });

      existingDeadlineKeys.add(key);
    }
  }

  // Batch create deadlines
  if (deadlinesToCreate.length > 0) {
    await db.deadline.createMany({
      data: deadlinesToCreate,
    });
    created = deadlinesToCreate.length;
  }

  // Create audit log
  if (created > 0) {
    await createAuditLog({
      tenantId,
      userId,
      companyId,
      action: 'CREATE',
      entityType: 'Deadline',
      entityId: companyId,
      summary: `Auto-generated ${created} deadlines from rules for ${company.name}`,
      changeSource: 'SYSTEM',
      metadata: {
        created,
        skipped,
        monthsAhead,
        contractServiceId,
      },
    });
  }

  return { created, skipped };
}

/**
 * Preview deadlines from rule inputs without persisting anything.
 * Uses the same generation logic as actual creation.
 */
export async function previewDeadlinesFromRuleInputs(
  companyId: string,
  rules: DeadlineRuleInput[],
  params: TenantAwareParams,
  options?: {
    monthsAhead?: number;
    serviceStartDate?: string | Date | null;
    fyeYearOverride?: number | null;
    excludedDeadlines?: DeadlineExclusionInput[] | null;
  }
): Promise<PreviewDeadlinesResult> {
  const { tenantId, tx } = params;
  const db = tx || prisma;
  const monthsAhead = options?.monthsAhead ?? 18;

  const company = await db.company.findFirst({
    where: { id: companyId, tenantId, deletedAt: null },
  });

  if (!company) {
    throw new Error('Company not found');
  }

  const warnings: string[] = [];

  // Build company context
  const context: CompanyDeadlineContext = {
    company,
    fyeMonth: company.financialYearEndMonth,
    fyeDay: company.financialYearEndDay,
    incorporationDate: company.incorporationDate,
    isGstRegistered: company.isGstRegistered,
    gstFilingFrequency: company.gstFilingFrequency as GstFilingFrequency | null,
    isRegisteredCharity: company.isRegisteredCharity,
    isIPC: company.isIPC,
    ipcExpiryDate: company.ipcExpiryDate,
    agmDispensed: company.agmDispensed,
    isDormant: company.isDormant,
    dormantTaxExemptionApproved: company.dormantTaxExemptionApproved,
    requiresAudit: determineAuditRequirement(company),
    entityType: company.entityType,
  };

  const resolvedServiceStartDate = options?.serviceStartDate
    ? new Date(options.serviceStartDate)
    : new Date();
  if (Number.isNaN(resolvedServiceStartDate.getTime())) {
    resolvedServiceStartDate.setTime(Date.now());
  }

  const serviceContext: ServiceContext = {
    service: {} as ContractService,
    serviceStartDate: resolvedServiceStartDate,
    gstFilingFrequency: null,
  };

  const now = new Date();
  const lookbackStart = new Date(now);
  lookbackStart.setMonth(lookbackStart.getMonth() - monthsAhead);

  // Keep the lookback window so one-time SERVICE_START rules with negative offsets
  // remain visible in preview.
  const startDate = lookbackStart;

  const endDate = new Date(now);
  endDate.setMonth(endDate.getMonth() + monthsAhead);
  if (resolvedServiceStartDate > endDate) {
    const extendedEnd = new Date(resolvedServiceStartDate);
    extendedEnd.setMonth(extendedEnd.getMonth() + monthsAhead);
    if (extendedEnd > endDate) {
      endDate.setTime(extendedEnd.getTime());
    }
  }

  const generated: GeneratedDeadline[] = [];

  rules.forEach((rule, index) => {
    const taskName = rule.taskName?.trim() || 'Untitled task';

    if (rule.ruleType === 'FIXED_DATE') {
      if (!rule.specificDate) {
        warnings.push(`${taskName}: specific date not set`);
        return;
      }
    }

    if (rule.ruleType === 'RULE_BASED') {
      if (!rule.anchorType) {
        warnings.push(`${taskName}: anchor type not set`);
        return;
      }
      if (rule.anchorType === 'FYE' && (!context.fyeMonth || !context.fyeDay)) {
        warnings.push(`${taskName}: company FYE is not configured`);
        return;
      }
      if (rule.anchorType === 'INCORPORATION' && !context.incorporationDate) {
        warnings.push(`${taskName}: incorporation date not set`);
        return;
      }
      if (rule.anchorType === 'IPC_EXPIRY' && !context.ipcExpiryDate) {
        warnings.push(`${taskName}: IPC expiry date not set`);
        return;
      }
      if (rule.anchorType === 'SERVICE_START' && !resolvedServiceStartDate) {
        warnings.push(`${taskName}: service start date not set`);
        return;
      }
      if (rule.anchorType === 'FIXED_CALENDAR' && (!rule.fixedMonth || !rule.fixedDay)) {
        warnings.push(`${taskName}: fixed calendar date not set`);
        return;
      }
    }

    const pseudoRule: DeadlineRule = {
      id: `preview-${index}`,
      tenantId,
      contractServiceId: 'preview',
      taskName: rule.taskName,
      description: rule.description ?? null,
      category: rule.category,
      ruleType: rule.ruleType,
      anchorType: rule.anchorType ?? null,
      offsetMonths: rule.offsetMonths ?? 0,
      offsetDays: rule.offsetDays ?? 0,
      offsetBusinessDays: rule.offsetBusinessDays ?? false,
      fixedMonth: rule.fixedMonth ?? null,
      fixedDay: rule.fixedDay ?? null,
      specificDate: rule.specificDate ? new Date(rule.specificDate) : null,
      isRecurring: rule.isRecurring,
      frequency: rule.frequency ?? null,
      generateUntilDate: rule.generateUntilDate ? new Date(rule.generateUntilDate) : null,
      generateOccurrences: rule.generateOccurrences ?? null,
      isBillable: rule.isBillable,
      amount: rule.amount ?? null,
      currency: rule.currency ?? 'SGD',
      displayOrder: rule.displayOrder ?? index,
      sourceTemplateCode: rule.sourceTemplateCode ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as DeadlineRule;

    const ruleStartDate =
      options?.fyeYearOverride && rule.anchorType === 'FYE'
        ? new Date(options.fyeYearOverride, 0, 1)
        : startDate;

    const deadlines = generateDeadlinesFromRule(
      pseudoRule,
      context,
      serviceContext,
      ruleStartDate,
      endDate
    );
    generated.push(...deadlines);
  });

  const excludedDeadlineKeys = createExcludedDeadlineKeySet(options?.excludedDeadlines);
  const filteredGenerated = excludedDeadlineKeys.size > 0
    ? generated.filter((deadline) => {
      const key = buildExcludedDeadlineKey(deadline.title, deadline.statutoryDueDate);
      return !key || !excludedDeadlineKeys.has(key);
    })
    : generated;

  filteredGenerated.sort((a, b) => a.statutoryDueDate.getTime() - b.statutoryDueDate.getTime());

  return { deadlines: filteredGenerated, warnings };
}

/**
 * Generate deadline instances from a DeadlineRule within a date range
 */
function generateDeadlinesFromRule(
  rule: DeadlineRule,
  context: CompanyDeadlineContext,
  serviceContext: ServiceContext,
  startDate: Date,
  endDate: Date
): GeneratedDeadline[] {
  const deadlines: GeneratedDeadline[] = [];

  if (rule.ruleType === 'FIXED_DATE') {
    // Handle fixed-date rules
    if (!rule.specificDate) {
      console.warn(`Rule ${rule.taskName} is FIXED_DATE but missing specificDate`);
      return [];
    }

    const baseDate = new Date(rule.specificDate);

    if (rule.isRecurring && rule.frequency) {
      // Recurring fixed-date deadlines
      const occurrences = generateRecurringFromFixedDate(
        rule,
        baseDate,
        startDate,
        endDate
      );

      for (const occurrence of occurrences) {
        deadlines.push({
          title: rule.taskName,
          description: rule.description,
          category: rule.category,
          referenceCode: `${rule.taskName.replace(/\s+/g, '_').toUpperCase()}-${occurrence.year}`,
          periodLabel: `${occurrence.year}`,
          periodStart: null,
          periodEnd: null,
          statutoryDueDate: occurrence.date,
          isBillable: rule.isBillable,
          amount: rule.amount ? Number(rule.amount) : null,
          currency: rule.currency || 'SGD',
          templateCode: rule.sourceTemplateCode || 'CUSTOM',
        });
      }
    } else {
      // One-time fixed-date deadline
      if (baseDate >= startDate && baseDate <= endDate) {
        deadlines.push({
          title: rule.taskName,
          description: rule.description,
          category: rule.category,
          referenceCode: `${rule.taskName.replace(/\s+/g, '_').toUpperCase()}-${baseDate.getFullYear()}`,
          periodLabel: `${baseDate.getFullYear()}`,
          periodStart: null,
          periodEnd: null,
          statutoryDueDate: baseDate,
          isBillable: rule.isBillable,
          amount: rule.amount ? Number(rule.amount) : null,
          currency: rule.currency || 'SGD',
          templateCode: rule.sourceTemplateCode || 'CUSTOM',
        });
      }
    }
  } else if (rule.ruleType === 'RULE_BASED') {
    // Handle rule-based deadlines (use existing logic)
    if (!rule.anchorType) {
      console.warn(`Rule ${rule.taskName} is RULE_BASED but missing anchorType`);
      return [];
    }

    if (rule.anchorType === 'SERVICE_START') {
      return generateServiceStartDeadlines(rule, serviceContext, startDate, endDate);
    }

    // Convert DeadlineRule to DeadlineTemplateData format
    const pseudoTemplate: DeadlineTemplateData = {
      code: rule.sourceTemplateCode || 'CUSTOM',
      name: rule.taskName,
      category: rule.category,
      jurisdiction: 'SG',
      description: rule.description || '',
      entityTypes: null,
      excludeEntityTypes: null,
      requiresGstRegistered: null,
      requiresAudit: null,
      isTaxFiling: false,
      requiresCharityStatus: null,
      requiresIPCStatus: null,
      anchorType: rule.anchorType,
      offsetMonths: rule.offsetMonths ?? 0,
      offsetDays: rule.offsetDays ?? 0,
      offsetBusinessDays: rule.offsetBusinessDays ?? false,
      fixedMonth: rule.fixedMonth,
      fixedDay: rule.fixedDay,
      frequency: rule.frequency || 'ONE_TIME',
      generateMonthsAhead: 18,
      isOptional: false,
      optionalNote: null,
      isBillable: rule.isBillable,
      defaultAmount: rule.amount ? Number(rule.amount) : null,
      reminderDaysBefore: [60, 30, 14, 7],
    };

    // Use existing template generation logic
    return generateDeadlinesFromTemplate(
      pseudoTemplate,
      context,
      serviceContext,
      startDate,
      endDate
    );
  }

  return deadlines;
}

function generateServiceStartDeadlines(
  rule: DeadlineRule,
  serviceContext: ServiceContext,
  startDate: Date,
  endDate: Date
): GeneratedDeadline[] {
  if (!serviceContext.serviceStartDate) {
    return [];
  }

  const baseDate = new Date(serviceContext.serviceStartDate);
  if (Number.isNaN(baseDate.getTime())) {
    return [];
  }

  const effectiveFrequency = rule.isRecurring
    ? (rule.frequency || 'ONE_TIME')
    : 'ONE_TIME';

  const recurrenceRule: DeadlineRule = {
    ...rule,
    frequency: effectiveFrequency,
  };

  const template: DeadlineTemplateData = {
    code: rule.sourceTemplateCode || 'CUSTOM',
    name: rule.taskName,
    category: rule.category,
    jurisdiction: 'SG',
    description: rule.description || '',
    entityTypes: null,
    excludeEntityTypes: null,
    requiresGstRegistered: null,
    requiresAudit: null,
    isTaxFiling: false,
    requiresCharityStatus: null,
    requiresIPCStatus: null,
    anchorType: 'SERVICE_START',
    offsetMonths: rule.offsetMonths ?? 0,
    offsetDays: rule.offsetDays ?? 0,
    offsetBusinessDays: rule.offsetBusinessDays ?? false,
    fixedMonth: rule.fixedMonth,
    fixedDay: rule.fixedDay,
    frequency: effectiveFrequency,
    generateMonthsAhead: 18,
    isOptional: false,
    optionalNote: null,
    isBillable: rule.isBillable,
    defaultAmount: rule.amount ? Number(rule.amount) : null,
    reminderDaysBefore: [60, 30, 14, 7],
  };

  const occurrences = generateRecurringFromFixedDate(
    recurrenceRule,
    baseDate,
    baseDate,
    endDate
  );

  const generated: GeneratedDeadline[] = [];

  for (const occurrence of occurrences) {
    const anchorDate = occurrence.date;
    const anchorYear = anchorDate.getFullYear();
    const anchorMonth = anchorDate.getMonth() + 1;
    const anchorQuarter = Math.floor(anchorDate.getMonth() / 3) + 1;

    let dueDate: Date;
    try {
      dueDate = calculateDueDate(template, anchorDate, anchorYear);
    } catch {
      continue;
    }

    if (dueDate < startDate || dueDate > endDate) {
      continue;
    }

    const labelYear = dueDate.getFullYear();
    const labelMonth = dueDate.getMonth() + 1;
    const labelQuarter = Math.floor(dueDate.getMonth() / 3) + 1;

    const periodLabel = generatePeriodLabel(
      template,
      labelYear,
      template.frequency === 'QUARTERLY' ? labelQuarter : undefined,
      template.frequency === 'MONTHLY' ? labelMonth : undefined
    );

    const referenceCode = generateReferenceCode(
      template,
      labelYear,
      template.frequency === 'QUARTERLY' ? labelQuarter : undefined,
      template.frequency === 'MONTHLY' ? labelMonth : undefined
    );

    const periodStart =
      template.frequency === 'ANNUALLY'
        ? getPeriodStart(anchorDate, 'ANNUALLY')
        : template.frequency === 'QUARTERLY'
          ? getQuarterStart(anchorYear, anchorQuarter)
          : template.frequency === 'MONTHLY'
            ? new Date(anchorYear, anchorMonth - 1, 1)
            : null;

    generated.push({
      title: `${rule.taskName} - ${periodLabel}`,
      description: rule.description,
      category: rule.category,
      referenceCode,
      periodLabel,
      periodStart,
      periodEnd: anchorDate,
      statutoryDueDate: dueDate,
      isBillable: rule.isBillable,
      amount: rule.amount ? Number(rule.amount) : null,
      currency: rule.currency || 'SGD',
      templateCode: rule.sourceTemplateCode || 'CUSTOM',
    });
  }

  return generated;
}

/**
 * Generate recurring occurrences from a fixed date
 */
function generateRecurringFromFixedDate(
  rule: DeadlineRule,
  baseDate: Date,
  startDate: Date,
  endDate: Date
): Array<{ date: Date; year: number }> {
  const occurrences: Array<{ date: Date; year: number }> = [];

  if (!rule.frequency || rule.frequency === 'ONE_TIME') {
    return [{ date: baseDate, year: baseDate.getFullYear() }];
  }

  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();

  // Determine occurrence limit
  let maxOccurrences = rule.generateOccurrences || 999;
  if (rule.generateUntilDate) {
    const untilDate = new Date(rule.generateUntilDate);
    // Override maxOccurrences based on date range
    maxOccurrences = Math.min(maxOccurrences, (untilDate.getFullYear() - startYear + 1) * 12);
  }

  let occurrenceCount = 0;

  if (rule.frequency === 'ANNUALLY') {
    // Generate annually on the same month/day
    for (let year = startYear; year <= endYear && occurrenceCount < maxOccurrences; year++) {
      const occurrence = new Date(
        year,
        baseDate.getMonth(),
        baseDate.getDate()
      );

      if (occurrence >= startDate && occurrence <= endDate) {
        occurrences.push({ date: occurrence, year });
        occurrenceCount++;
      }
    }
  } else if (rule.frequency === 'QUARTERLY') {
    // Generate quarterly
    for (let year = startYear; year <= endYear && occurrenceCount < maxOccurrences; year++) {
      for (let quarter = 0; quarter < 4; quarter++) {
        const occurrence = new Date(
          year,
          baseDate.getMonth() + (quarter * 3),
          baseDate.getDate()
        );

        if (occurrence >= startDate && occurrence <= endDate) {
          occurrences.push({ date: occurrence, year: occurrence.getFullYear() });
          occurrenceCount++;
        }
      }
    }
  } else if (rule.frequency === 'MONTHLY') {
    // Generate monthly
    const currentDate = new Date(baseDate);
    currentDate.setFullYear(startYear);

    while (currentDate <= endDate && occurrenceCount < maxOccurrences) {
      if (currentDate >= startDate) {
        occurrences.push({
          date: new Date(currentDate),
          year: currentDate.getFullYear(),
        });
        occurrenceCount++;
      }

      currentDate.setMonth(currentDate.getMonth() + 1);
    }
  }

  return occurrences;
}
