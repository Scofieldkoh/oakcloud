import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getSession } from '@/lib/auth';
import { requireTenantContext } from '@/lib/api-helpers';
import { createServiceTemplateSchema } from '@/lib/validations/service-template';
import {
  createServiceTemplate,
  listServiceTemplates,
} from '@/services/service-template.service';

function isTemplateAdmin(session: { isSuperAdmin: boolean; isTenantAdmin: boolean }): boolean {
  return session.isSuperAdmin || session.isTenantAdmin;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isTemplateAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const tenantIdParam = request.nextUrl.searchParams.get('tenantId');
    const tenantResult = await requireTenantContext(session, tenantIdParam);
    if (tenantResult.error) return tenantResult.error;

    const templates = await listServiceTemplates(tenantResult.tenantId);
    return NextResponse.json({ templates });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Tenant not found')) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
      }
    }
    console.error('Error listing service templates:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isTemplateAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { tenantId: tenantIdParam, ...payload } = body as {
      tenantId?: string;
      [key: string]: unknown;
    };

    const tenantResult = await requireTenantContext(session, tenantIdParam);
    if (tenantResult.error) return tenantResult.error;

    const data = createServiceTemplateSchema.parse(payload);
    const template = await createServiceTemplate(data, {
      tenantId: tenantResult.tenantId,
      userId: session.id,
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    if (error instanceof Error && error.message.includes('Tenant not found')) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    console.error('Error creating service template:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
