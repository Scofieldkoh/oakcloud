import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { createToken } from '@/lib/auth';
import { logAuthEvent } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find user by email with tenant info and role assignments
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        tenant: true,
        roleAssignments: {
          select: {
            role: {
              select: {
                systemRoleType: true,
              },
            },
          },
        },
      },
    });

    if (!user || !user.isActive || user.deletedAt) {
      // Log failed login attempt
      await logAuthEvent('LOGIN_FAILED', undefined, {
        email: email.toLowerCase(),
        reason: !user ? 'User not found' : 'Account inactive or deleted',
      });
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Compute role flags from role assignments (authoritative source)
    const isSuperAdmin = user.roleAssignments.some(
      (a) => a.role.systemRoleType === 'SUPER_ADMIN'
    );
    const isTenantAdmin = user.roleAssignments.some(
      (a) => a.role.systemRoleType === 'TENANT_ADMIN'
    );

    // Check tenant status (skip for SUPER_ADMIN who may not have a tenant)
    if (user.tenant) {
      if (user.tenant.status === 'SUSPENDED') {
        await logAuthEvent('LOGIN_FAILED', user.id, {
          email: user.email,
          userName: `${user.firstName} ${user.lastName}`,
          reason: 'Tenant suspended',
          tenantId: user.tenantId,
          tenantName: user.tenant.name,
        });
        return NextResponse.json(
          { error: 'Your organization has been suspended. Please contact support.' },
          { status: 403 }
        );
      }
      if (user.tenant.status === 'DEACTIVATED') {
        await logAuthEvent('LOGIN_FAILED', user.id, {
          email: user.email,
          userName: `${user.firstName} ${user.lastName}`,
          reason: 'Tenant deactivated',
          tenantId: user.tenantId,
          tenantName: user.tenant.name,
        });
        return NextResponse.json(
          { error: 'Your organization has been deactivated. Please contact support.' },
          { status: 403 }
        );
      }
      if (user.tenant.status === 'PENDING_SETUP') {
        await logAuthEvent('LOGIN_FAILED', user.id, {
          email: user.email,
          userName: `${user.firstName} ${user.lastName}`,
          reason: 'Tenant pending setup',
          tenantId: user.tenantId,
          tenantName: user.tenant.name,
        });
        return NextResponse.json(
          { error: 'Your organization setup is not complete. Please contact your administrator.' },
          { status: 403 }
        );
      }
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      await logAuthEvent('LOGIN_FAILED', user.id, {
        email: user.email,
        userName: `${user.firstName} ${user.lastName}`,
        reason: 'Invalid password',
      });
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Update last login - non-critical, don't fail login if this fails
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    } catch (updateError) {
      console.error('Failed to update lastLoginAt:', updateError);
      // Continue with login - this is non-critical metadata
    }

    // Log successful login
    await logAuthEvent('LOGIN', user.id, {
      email: user.email,
      userName: `${user.firstName} ${user.lastName}`,
      isSuperAdmin,
      isTenantAdmin,
      tenantId: user.tenantId,
      tenantName: user.tenant?.name,
    });

    // Create JWT token
    const token = await createToken({
      userId: user.id,
      email: user.email,
      tenantId: user.tenantId,
      companyId: user.companyId,
    });

    // Set cookie
    const cookieStore = await cookies();
    cookieStore.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        tenantId: user.tenantId,
        isSuperAdmin,
        isTenantAdmin,
      },
      mustChangePassword: user.mustChangePassword,
      message: 'Login successful',
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
