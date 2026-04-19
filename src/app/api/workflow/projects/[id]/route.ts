import { NextRequest, NextResponse } from 'next/server';
import { canAccessCompany, requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { parseIdParams } from '@/lib/validations/params';
import { z } from 'zod';
import {
  deleteWorkflowProject,
  getWorkflowProjectDetail,
  resolveWorkflowProjectCompanyId,
  updateWorkflowProjectSettings,
} from '@/services/workflow-project.service';

const billingTierSchema = z.object({
  upTo: z.number().int().positive('Tier upper limit must be a positive integer').nullable(),
  unitPrice: z.number().min(0, 'Tier unit price must be zero or more'),
});

const billingConfigSchema = z.object({
  mode: z.enum(['FIXED', 'TIERED']),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Billing currency must be a 3-letter code'),
  fixedPrice: z.number().min(0, 'Fixed price must be zero or more').nullable(),
  disbursementAmount: z.number().min(0, 'Disbursement amount must be zero or more').nullable(),
  referralFeeAmount: z.number().min(0, 'Referral fee must be zero or more').nullable(),
  referralFeeType: z.enum(['AMOUNT', 'PERCENTAGE']),
  referralFeeRecurringLimit: z.number().int().positive('Referral cycle limit must be a positive whole number').nullable(),
  referralPayee: z.string().max(255, 'Referral payee is too long'),
  referralPayeeContactId: z.string().trim().max(255, 'Referral contact is invalid').nullable(),
  tiers: z.array(billingTierSchema).max(50, 'Too many pricing tiers'),
}).superRefine((value, ctx) => {
  if (value.mode === 'FIXED' && value.fixedPrice === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fixedPrice'],
      message: 'Fixed price is required when billing mode is fixed',
    });
  }

  if (value.mode === 'TIERED' && value.tiers.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['tiers'],
      message: 'At least one tier is required when billing mode is tiered',
    });
  }

  if ((value.referralFeeAmount ?? 0) > 0 && value.referralPayee.trim().length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['referralPayee'],
      message: 'Referral payee is required when a referral fee is entered',
    });
  }

  if (value.referralFeeType === 'PERCENTAGE' && (value.referralFeeAmount ?? 0) > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['referralFeeAmount'],
      message: 'Referral percentage cannot exceed 100',
    });
  }
});

const workspaceStateSchema = z.object({
  groups: z.array(z.unknown()).optional(),
  projectAttachments: z.array(z.unknown()).optional(),
  billingQuantity: z.number().int().min(0, 'Billing quantity must be zero or more').nullable().optional(),
  billingStatus: z.enum(['PENDING', 'TO_BE_BILLED', 'BILLED']).nullable().optional(),
  projectStatusOverride: z.enum(['AT_RISK', 'ON_HOLD']).nullable().optional(),
  projectNotes: z.string().max(100000, 'Project notes are too long').optional(),
});

const updateWorkflowProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(255, 'Project name is too long'),
  startDate: z.string().date('Invalid start date'),
  dueDate: z.string().date('Invalid due date'),
  recurrenceMonths: z.number().int().min(1, 'Recurring interval must be at least 1 month').max(120).nullable(),
  billingConfig: billingConfigSchema.optional(),
  workspaceState: workspaceStateSchema.optional(),
});

const deleteWorkflowProjectSchema = z.object({
  reason: z.string().trim().min(10, 'Reason must be at least 10 characters'),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await parseIdParams(params);

    const companyId = await resolveWorkflowProjectCompanyId(id, {
      tenantId: session.tenantId,
      skipTenantFilter: session.isSuperAdmin && !session.tenantId,
    });

    if (!companyId) {
      return NextResponse.json({ error: 'Workflow project not found' }, { status: 404 });
    }

    await requirePermission(session, 'company', 'read', companyId);

    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const detail = await getWorkflowProjectDetail(id, {
      tenantId: session.tenantId,
      skipTenantFilter: session.isSuperAdmin && !session.tenantId,
    });

    if (!detail) {
      return NextResponse.json({ error: 'Workflow project not found' }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await parseIdParams(params);

    const companyId = await resolveWorkflowProjectCompanyId(id, {
      tenantId: session.tenantId,
      skipTenantFilter: session.isSuperAdmin && !session.tenantId,
    });

    if (!companyId) {
      return NextResponse.json({ error: 'Workflow project not found' }, { status: 404 });
    }

    await requirePermission(session, 'company', 'update', companyId);

    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = updateWorkflowProjectSchema.parse(await request.json());

    if (payload.dueDate < payload.startDate) {
      return NextResponse.json({ error: 'Due date must be on or after start date' }, { status: 400 });
    }

    const detail = await updateWorkflowProjectSettings(id, payload, {
      tenantId: session.tenantId,
      skipTenantFilter: session.isSuperAdmin && !session.tenantId,
    });

    if (!detail) {
      return NextResponse.json({ error: 'Workflow project not found' }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await parseIdParams(params);

    const body = await request.json().catch(() => ({}));
    deleteWorkflowProjectSchema.parse(body);

    const companyId = await resolveWorkflowProjectCompanyId(id, {
      tenantId: session.tenantId,
      skipTenantFilter: session.isSuperAdmin && !session.tenantId,
    });

    if (!companyId) {
      return NextResponse.json({ error: 'Workflow project not found' }, { status: 404 });
    }

    await requirePermission(session, 'company', 'delete', companyId);

    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const deleted = await deleteWorkflowProject(id, {
      tenantId: session.tenantId,
      skipTenantFilter: session.isSuperAdmin && !session.tenantId,
    });

    if (!deleted) {
      return NextResponse.json({ error: 'Workflow project not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
