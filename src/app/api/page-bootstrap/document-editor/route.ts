import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getA4EditorCapabilities } from '@/lib/document-editor/a4-editor-capabilities';

export async function GET() {
  try {
    await requireAuth();
    return NextResponse.json({
      a4EditorCapabilities: getA4EditorCapabilities(),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
