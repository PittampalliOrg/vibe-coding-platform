'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, FileCode } from 'lucide-react';
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

interface WorkflowData {
  name: string;
  runCount: number;
  lastRun?: {
    runId: string;
    status: string;
    createdAt: string;
  };
}

export function WorkflowsList() {
  const [workflows, setWorkflows] = useState<WorkflowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchWorkflows = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/workflows?includeStats=true');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      // Transform simple workflow names to WorkflowData if needed
      if (Array.isArray(data.workflows)) {
        if (typeof data.workflows[0] === 'string') {
          setWorkflows(data.workflows.map((name: string) => ({
            name,
            runCount: data.stats?.[name]?.runCount ?? 0,
            lastRun: data.stats?.[name]?.lastRun,
          })));
        } else {
          setWorkflows(data.workflows);
        }
      } else {
        setWorkflows([]);
      }
      setError(null);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load workflows');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const getStatusVariant = (status?: string) => {
    if (!status) return 'secondary';
    switch (status) {
      case 'completed':
        return 'completed';
      case 'failed':
        return 'failed';
      case 'running':
        return 'running';
      case 'pending':
        return 'pending';
      default:
        return 'secondary';
    }
  };

  const secondsAgo = Math.floor((new Date().getTime() - lastRefresh.getTime()) / 1000);

  return (
    <div className="space-y-4">
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {workflows.length} workflow{workflows.length !== 1 ? 's' : ''} discovered
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Last refreshed {secondsAgo}s ago
          </span>
          <Button variant="outline" size="sm" onClick={fetchWorkflows} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-destructive text-sm">Failed to load workflows: {error}</p>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Workflow Name</TableHead>
              <TableHead>Total Runs</TableHead>
              <TableHead>Last Run Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-12" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                </TableRow>
              ))
            ) : workflows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center">
                  <div className="text-muted-foreground">
                    <FileCode className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="font-medium">No workflows discovered</p>
                    <p className="text-sm">Workflows will appear here after their first run</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              workflows.map((workflow) => (
                <TableRow key={workflow.name}>
                  <TableCell className="font-medium">{workflow.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {workflow.runCount}
                  </TableCell>
                  <TableCell>
                    {workflow.lastRun ? (
                      <Badge variant={getStatusVariant(workflow.lastRun.status)}>
                        {workflow.lastRun.status}
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
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
