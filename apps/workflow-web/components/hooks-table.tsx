'use client';

import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatRelativeTime } from '@/lib/utils';

interface HookData {
  hookId: string;
  name: string;
  type: string;
  status: string;
  workflowName?: string;
  createdAt: string;
  lastTriggeredAt?: string;
}

export function HooksTable() {
  const [hooks, setHooks] = useState<HookData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchHooks = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/hooks');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setHooks(data.hooks || []);
      setError(null);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load hooks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHooks();
  }, []);

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'active':
        return 'completed';
      case 'inactive':
        return 'secondary';
      case 'error':
        return 'failed';
      default:
        return 'outline';
    }
  };

  const secondsAgo = Math.floor((new Date().getTime() - lastRefresh.getTime()) / 1000);

  return (
    <div className="space-y-4">
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {hooks.length} hook{hooks.length !== 1 ? 's' : ''} registered
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Last refreshed {secondsAgo}s ago
          </span>
          <Button variant="outline" size="sm" onClick={fetchHooks} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-destructive text-sm">Failed to load hooks: {error}</p>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Workflow</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last Triggered</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                </TableRow>
              ))
            ) : hooks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <div className="text-muted-foreground">
                    <p className="font-medium">No hooks registered</p>
                    <p className="text-sm">Hooks allow you to trigger workflows via HTTP or events</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              hooks.map((hook) => (
                <TableRow key={hook.hookId}>
                  <TableCell className="font-medium font-mono text-sm">
                    {hook.name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{hook.type}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {hook.workflowName || '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(hook.status)}>{hook.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatRelativeTime(hook.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {hook.lastTriggeredAt ? formatRelativeTime(hook.lastTriggeredAt) : '-'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
