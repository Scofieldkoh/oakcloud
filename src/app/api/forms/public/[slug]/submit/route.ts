import { NextResponse } from 'next/server';
import { z } from 'zod';
import { publicSubmissionSchema } from '@/lib/validations/form-builder';
import { createPublicSubmission } from '@/services/form-builder.service';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { slug } = await params;
    const body = await request.json();

    const payload = publicSubmissionSchema.parse(body);

    const submission = await createPublicSubmission(slug, payload);

    return NextResponse.json(
      {
        id: submission.id,
        submittedAt: submission.submittedAt,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid submission payload', details: error.errors }, { status: 400 });
    }

    if (error instanceof Error) {
      if (error.message.includes('required')) {
        return NextResponse.json({ error: error.message }, { status: 422 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
