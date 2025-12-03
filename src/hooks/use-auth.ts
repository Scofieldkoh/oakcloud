'use client';

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tenantId?: string | null;
  companyId?: string | null;
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
}

interface LoginCredentials {
  email: string;
  password: string;
}

async function fetchSession(): Promise<User | null> {
  const response = await fetch('/api/auth/me');
  if (!response.ok) {
    if (response.status === 401) {
      return null;
    }
    throw new Error('Failed to fetch session');
  }
  const data = await response.json();
  return data.user;
}

interface LoginResponse {
  user: User;
  mustChangePassword: boolean;
}

async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Login failed');
  }

  const data = await response.json();
  return { user: data.user, mustChangePassword: data.mustChangePassword };
}

async function logout(): Promise<void> {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Logout failed');
  }
}

export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: fetchSession,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: login,
    onSuccess: (response) => {
      queryClient.setQueryData(['session'], response.user);

      // Redirect to password change if required
      if (response.mustChangePassword) {
        router.push('/change-password?forced=true');
      } else {
        router.push('/companies');
      }
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(['session'], null);
      queryClient.clear();
      router.push('/login');
    },
  });
}

export function useRequireAuth() {
  const { data: user, isLoading, isFetched } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (isFetched && !user) {
      router.push('/login');
    }
  }, [isFetched, user, router]);

  return { user, isLoading };
}
