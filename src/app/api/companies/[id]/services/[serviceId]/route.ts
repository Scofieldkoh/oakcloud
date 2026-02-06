import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { requireTenantContext } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';
import type { DeadlineRule } from '@/generated/prisma';
import type { DeadlineRuleInput } from '@/lib/validations/service';
import {
  deleteContractService,
  getContractServiceById,
  updateContractService,
} from '@/services/contract-service.service';
import {
  deleteDeadlineRules,
  getDeadlineRules,
  updateDeadlineRules,
} from '@/services/deadline-rule.service';
import { generateDeadlinesFromRules } from '@/services/deadline-generation.service';
import { updateContractServiceSchema } from '@/lib/validations/contract';

type RouteParams = {
  params: Promise<{ id: string; serviceId: string }>;
};

function serializeDeadlineRule(rule: DeadlineRule): DeadlineRuleInput {
  return {
    taskName: rule.taskName,
    description: rule.description,
    category: rule.category,
    ruleType: rule.ruleType,
    anchorType: rule.anchorType,
    offsetMonths: rule.offsetMonths,
    offsetDays: rule.offsetDays,
    offsetBusinessDays: rule.offsetBusinessDays,
    fixedMonth: rule.fixedMonth,
    fixedDay: rule.fixedDay,
    specificDate: rule.specificDate ? rule.specificDate.toISOString().split('T')[0] : null,
    isRecurring: rule.isRecurring,
    frequency: rule.frequency,
    generateUntilDate: rule.generateUntilDate ? rule.generateUntilDate.toISOString().split('T')[0] : null,
    generateOccurrences: rule.generateOccurrences,
    isBillable: rule.isBillable,
    amount: rule.amount != null ? Number(rule.amount) : null,
    currency: rule.currency,
    displayOrder: rule.displayOrder,
    sourceTemplateCode: rule.sourceTemplateCode,
  };
}

/**
 * GET /api/companies/[id]/services/[serviceId]
 * Get one company service by ID.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id: companyId, serviceId } = await params;

    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await requirePermission(session, 'contract', 'read', companyId);

    const { searchParams } = new URL(request.url);
    const tenantIdParam = searchParams.get('tenantId');
    const tenantResult = await requireTenantContext(session, tenantIdParam);
    if (tenantResult.error) return tenantResult.error;
    const tenantId = tenantResult.tenantId;

    const service = await getContractServiceById(serviceId, tenantId);
    if (!service || service.contract?.companyId !== companyId) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    const deadlineRules = await getDeadlineRules(serviceId, {
      tenantId,
      userId: session.id,
    });

    return NextResponse.json({
      ...service,
      deadlineRules: deadlineRules.map(serializeDeadlineRule),
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    console.error('Error fetching company service:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/companies/[id]/services/[serviceId]
 * Update one company service.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id: companyId, serviceId } = await params;

    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await requirePermission(session, 'contract', 'update', companyId);

    const body = await request.json();
    const {
      tenantId: bodyTenantId,
      regenerateDeadlines,
      ...serviceData
    } = body as {
      tenantId?: string;
      regenerateDeadlines?: boolean;
      [key: string]: unknown;
    };

    const tenantResult = await requireTenantContext(session, bodyTenantId);
    if (tenantResult.error) return tenantResult.error;
    const tenantId = tenantResult.tenantId;

    const existingService = await getContractServiceById(serviceId, tenantId);
    if (!existingService || existingService.contract?.companyId !== companyId) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    const data = updateContractServiceSchema.parse({
      ...serviceData,
      id: serviceId,
    });

    const fyeYearOverride = data.fyeYearOverride ?? null;
    const {
      deadlineRules,
      ...serviceUpdateData
    } = data;

    const updatedService = await updateContractService(serviceUpdateData, {
      tenantId,
      userId: session.id,
    });

    // Optional: update deadline rules and regenerate deadlines in one request.
    if (deadlineRules !== undefined) {
      const nextRules = deadlineRules ?? [];
      if (nextRules.length > 0) {
        await updateDeadlineRules(serviceId, nextRules, {
          tenantId,
          userId: session.id,
        });
      } else {
        await deleteDeadlineRules(serviceId, {
          tenantId,
          userId: session.id,
        });
      }

      await prisma.contractService.update({
        where: { id: serviceId },
        data: { hasCustomDeadlines: nextRules.length > 0 },
      });

      const shouldRegenerate = regenerateDeadlines !== false;
      if (shouldRegenerate) {
        if (nextRules.length > 0) {
          await generateDeadlinesFromRules(serviceId, companyId, {
            tenantId,
            userId: session.id,
          }, {
            regenerate: true,
            fyeYearOverride: fyeYearOverride ?? undefined,
          });
        } else {
          await prisma.deadline.deleteMany({
            where: {
              tenantId,
              companyId,
              contractServiceId: serviceId,
            },
          });
        }
      }
    }

    const refreshedRules = await getDeadlineRules(serviceId, {
      tenantId,
      userId: session.id,
    });

    return NextResponse.json({
      ...updatedService,
      deadlineRules: refreshedRules.map(serializeDeadlineRule),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Service not found') {
        return NextResponse.json({ error: 'Service not found' }, { status: 404 });
      }
    }
    console.error('Error updating company service:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/companies/[id]/services/[serviceId]
 * Soft-delete one company service.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id: companyId, serviceId } = await params;

    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await requirePermission(session, 'contract', 'delete', companyId);

    const { searchParams } = new URL(request.url);
    const tenantIdParam = searchParams.get('tenantId');
    const tenantResult = await requireTenantContext(session, tenantIdParam);
    if (tenantResult.error) return tenantResult.error;
    const tenantId = tenantResult.tenantId;

    const existingService = await getContractServiceById(serviceId, tenantId);
    if (!existingService || existingService.contract?.companyId !== companyId) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    await deleteContractService(serviceId, {
      tenantId,
      userId: session.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Service not found') {
        return NextResponse.json({ error: 'Service not found' }, { status: 404 });
      }
    }
    console.error('Error deleting company service:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
