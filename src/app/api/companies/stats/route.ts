import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getCompanyStats } from '@/services/company.service';

export async function GET() {
  try {
    await requireRole(['SUPER_ADMIN']);

    const stats = await getCompanyStats();

    return NextResponse.json(stats);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
