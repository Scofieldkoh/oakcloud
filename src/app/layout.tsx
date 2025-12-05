import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Oakcloud - Practice Management System',
  description: 'Internal management system for accounting practices',
  icons: {
    icon: [
      { url: '/falcon.svg', sizes: '32x32', type: 'image/svg+xml' },
      { url: '/falcon.svg', sizes: '64x64', type: 'image/svg+xml' },
    ],
    apple: { url: '/falcon.svg', sizes: '180x180' },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
