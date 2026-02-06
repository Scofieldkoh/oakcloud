import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getSession } from '@/lib/auth';
import { requireTenantContext } from '@/lib/api-helpers';
import { updateServiceTemplateSchema } from '@/lib/validations/service-template';
import {
  deleteServiceTemplate,
  overwriteSystemServiceTemplate,
  updateServiceTemplate,
} from '@/services/service-template.service';

function isTemplateAdmin(session: { isSuperAdmin: boolean; isTenantAdmin: boolean }): boolean {
  return session.isSuperAdmin || session.isTenantAdmin;
}

type RouteParams = {
  params: Promise<{ code: string }>;
};

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isTemplateAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { code } = await params;
    const decodedCode = decodeURIComponent(code);
    const body = await request.json();
    const { tenantId: tenantIdParam, systemOverride, ...payload } = body as {
      tenantId?: string;
      systemOverride?: boolean;
      [key: string]: unknown;
    };
    const isSystemOverride = systemOverride === true;

    const tenantResult = await requireTenantContext(session, tenantIdParam);
    if (tenantResult.error) return tenantResult.error;

    const data = updateServiceTemplateSchema.parse(payload);
    const template = isSystemOverride
      ? await overwriteSystemServiceTemplate(decodedCode, data, {
        tenantId: tenantResult.tenantId,
        userId: session.id,
      })
      : await updateServiceTemplate(decodedCode, data, {
        tenantId: tenantResult.tenantId,
        userId: session.id,
      });

    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    if (error instanceof Error) {
      if (error.message.includes('Template not found')) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }
      if (error.message.includes('System template not found')) {
        return NextResponse.json({ error: 'System template not found' }, { status: 404 });
      }
      if (error.message.includes('Tenant not found')) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
      }
      if (error.message.includes('Template code conflict')) {
        return NextResponse.json({ error: 'Template code conflict' }, { status: 409 });
      }
    }
    console.error('Error updating service template:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isTemplateAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { code } = await params;
    const decodedCode = decodeURIComponent(code);
    const tenantIdParam = request.nextUrl.searchParams.get('tenantId');
    const tenantResult = await requireTenantContext(session, tenantIdParam);
    if (tenantResult.error) return tenantResult.error;

    await deleteServiceTemplate(decodedCode, {
      tenantId: tenantResult.tenantId,
      userId: session.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Template not found')) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }
      if (error.message.includes('Tenant not found')) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
      }
    }
    console.error('Error deleting service template:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
