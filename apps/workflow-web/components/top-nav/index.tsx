'use client';

import { Info, Settings } from 'lucide-react';
import { Logo } from './logo';
import { Button } from '@/components/ui/button';

interface TopNavProps {
  deploymentContext?: string;
}

export function TopNav({ deploymentContext = 'Local (…/.next/workflow-data)' }: TopNavProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-between px-6">
        <Logo />

        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground flex items-center gap-1.5">
            Connected to: {deploymentContext}
            <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Settings className="h-4 w-4" />
            <span className="sr-only">Settings</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
