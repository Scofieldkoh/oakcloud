import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { logAuthEvent } from '@/lib/audit';
import { AUTH_COOKIE_NAME, HTTP_STATUS } from '@/lib/constants/application';

export async function POST() {
  try {
    // Get session before deleting the cookie
    const session = await getSession();

    const cookieStore = await cookies();
    cookieStore.delete(AUTH_COOKIE_NAME);

    // Log logout if we had a session
    if (session) {
      await logAuthEvent('LOGOUT', session.id, {
        email: session.email,
        userName: `${session.firstName} ${session.lastName}`,
        isSuperAdmin: session.isSuperAdmin,
        isTenantAdmin: session.isTenantAdmin,
        tenantId: session.tenantId,
      });
    }

    return NextResponse.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: HTTP_STATUS.SERVER_ERROR }
    );
  }
}
