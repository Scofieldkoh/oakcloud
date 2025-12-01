'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChakraProvider, createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';
import { useState, useEffect } from 'react';
import { ToastProvider, useToast, setToastHandler } from '@/components/ui/toast';
import { ThemeProvider } from '@/components/theme-provider';

const config = defineConfig({
  theme: {
    tokens: {
      colors: {
        oak: {
          50: { value: '#e8f5f1' },
          100: { value: '#c5e6dc' },
          200: { value: '#9ed5c5' },
          300: { value: '#77c4ae' },
          400: { value: '#59b69c' },
          500: { value: '#294d44' },
          600: { value: '#23423a' },
          700: { value: '#1f3a33' },
          800: { value: '#1a312c' },
          900: { value: '#142622' },
        },
        background: {
          primary: { value: 'var(--bg-primary)' },
          secondary: { value: 'var(--bg-secondary)' },
          tertiary: { value: 'var(--bg-tertiary)' },
          elevated: { value: 'var(--bg-elevated)' },
        },
      },
    },
    semanticTokens: {
      colors: {
        bg: {
          DEFAULT: { value: '{colors.background.primary}' },
          muted: { value: '{colors.background.secondary}' },
          subtle: { value: '{colors.background.tertiary}' },
          emphasized: { value: '{colors.background.elevated}' },
        },
      },
    },
  },
  globalCss: {
    body: {
      bg: 'background.primary',
      color: 'var(--text-primary)',
    },
  },
});

const system = createSystem(defaultConfig, config);

// Component to set up toast handler for non-component contexts
function ToastHandlerSetup() {
  const toastContext = useToast();

  useEffect(() => {
    setToastHandler(toastContext);
  }, [toastContext]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ChakraProvider value={system}>
          <ToastProvider>
            <ToastHandlerSetup />
            {children}
          </ToastProvider>
        </ChakraProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
