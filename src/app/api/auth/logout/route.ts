import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { logAuthEvent } from '@/lib/audit';

export async function POST() {
  try {
    // Get session before deleting the cookie
    const session = await getSession();

    const cookieStore = await cookies();
    cookieStore.delete('auth-token');

    // Log logout if we had a session
    if (session) {
      await logAuthEvent('LOGOUT', session.id, {
        email: session.email,
        userName: `${session.firstName} ${session.lastName}`,
        role: session.role,
        tenantId: session.tenantId,
      });
    }

    return NextResponse.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
