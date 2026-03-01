/**
 * Connector Model Configs API
 *
 * GET /api/connectors/[id]/models - List model configs for a connector
 * PUT /api/connectors/[id]/models - Toggle a model's enabled state
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AI_MODELS } from '@/lib/ai/models';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    if (!session.isSuperAdmin && !session.isTenantAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify connector exists and is accessible
    const connector = await prisma.connector.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(session.isSuperAdmin ? {} : { tenantId: session.tenantId }),
      },
    });

    if (!connector) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }

    // Get all models for this provider from the registry
    const registryModels = Object.values(AI_MODELS).filter(
      (m) => m.provider === connector.provider.toLowerCase()
    );

    if (registryModels.length === 0) {
      return NextResponse.json([]);
    }

    // Get existing overrides from DB
    const overrides = await prisma.connectorModelConfig.findMany({
      where: { connectorId: id },
    });

    const overrideMap = new Map(overrides.map((o) => [o.modelId, o.isEnabled]));

    const models = registryModels.map((m) => ({
      modelId: m.id,
      name: m.name,
      description: m.description,
      providerModelId: m.providerModelId,
      isEnabled: overrideMap.has(m.id) ? overrideMap.get(m.id)! : true,
      hasOverride: overrideMap.has(m.id),
    }));

    return NextResponse.json(models);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const toggleModelSchema = z.object({
  modelId: z.string().min(1),
  isEnabled: z.boolean(),
});

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    if (!session.isSuperAdmin && !session.isTenantAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify connector exists and is accessible
    const connector = await prisma.connector.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(session.isSuperAdmin ? {} : { tenantId: session.tenantId }),
      },
    });

    if (!connector) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }

    const body = await request.json();
    const { modelId, isEnabled } = toggleModelSchema.parse(body);

    // Validate that modelId belongs to this connector's provider
    const modelConfig = AI_MODELS[modelId as keyof typeof AI_MODELS];
    if (!modelConfig || modelConfig.provider !== connector.provider.toLowerCase()) {
      return NextResponse.json({ error: 'Invalid model for this connector' }, { status: 400 });
    }

    // Upsert the override
    const config = await prisma.connectorModelConfig.upsert({
      where: { connectorId_modelId: { connectorId: id, modelId } },
      create: { connectorId: id, modelId, isEnabled },
      update: { isEnabled },
    });

    return NextResponse.json({
      modelId: config.modelId,
      name: modelConfig.name,
      description: modelConfig.description,
      providerModelId: modelConfig.providerModelId,
      isEnabled: config.isEnabled,
      hasOverride: true,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
