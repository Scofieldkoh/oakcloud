import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      user: {
        id: session.id,
        email: session.email,
        firstName: session.firstName,
        lastName: session.lastName,
        tenantId: session.tenantId,
        isSuperAdmin: session.isSuperAdmin,
        isTenantAdmin: session.isTenantAdmin,
        companyIds: session.companyIds,
      },
    });
  } catch (error) {
    console.error('Session error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
