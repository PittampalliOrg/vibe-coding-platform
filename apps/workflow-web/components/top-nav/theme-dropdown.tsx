'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ThemeDropdown() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch by only rendering theme-dependent styles after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="inline-flex items-center rounded-md border bg-background p-0.5">
      <button
        onClick={() => setTheme('system')}
        className={cn(
          'inline-flex items-center justify-center rounded-sm p-1.5 text-muted-foreground transition-colors hover:text-foreground',
          mounted && theme === 'system' && 'bg-muted text-foreground'
        )}
        title="System theme"
      >
        <Monitor className="h-4 w-4" />
        <span className="sr-only">System theme</span>
      </button>
      <button
        onClick={() => setTheme('light')}
        className={cn(
          'inline-flex items-center justify-center rounded-sm p-1.5 text-muted-foreground transition-colors hover:text-foreground',
          mounted && theme === 'light' && 'bg-muted text-foreground'
        )}
        title="Light theme"
      >
        <Sun className="h-4 w-4" />
        <span className="sr-only">Light theme</span>
      </button>
      <button
        onClick={() => setTheme('dark')}
        className={cn(
          'inline-flex items-center justify-center rounded-sm p-1.5 text-muted-foreground transition-colors hover:text-foreground',
          mounted && theme === 'dark' && 'bg-muted text-foreground'
        )}
        title="Dark theme"
      >
        <Moon className="h-4 w-4" />
        <span className="sr-only">Dark theme</span>
      </button>
    </div>
  );
}
