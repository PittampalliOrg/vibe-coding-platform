'use client';

import { ThemeProvider } from 'next-themes';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Toaster } from 'sonner';
import { TopNav } from '@/components/top-nav';

interface LayoutClientProps {
  children: React.ReactNode;
}

export function LayoutClient({ children }: LayoutClientProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <NuqsAdapter>
        <div className="min-h-screen bg-background">
          <TopNav />
          <main>{children}</main>
        </div>
        <Toaster />
      </NuqsAdapter>
    </ThemeProvider>
  );
}
