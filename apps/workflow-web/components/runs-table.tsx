'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { RefreshCw, ChevronLeft, ChevronRight, ArrowDownZA, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useWorkflowFilter, useStatusFilter, useSortOrder } from '@/lib/url-state';
import { formatDuration } from '@/lib/utils';

interface RunData {
  runId: string;
  workflowName: string;
  status: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

interface RunsResponse {
  runs: RunData[];
  pagination: {
    hasMore: boolean;
    cursor?: string;
  };
}

const ALL_WORKFLOWS = '__all__';
const ALL_STATUSES = '__all__';

const statusOptions = [
  { value: ALL_STATUSES, label: 'Any status' },
  { value: 'pending', label: 'Pending' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function StatusDot({ status }: { status: string }) {
  const colorClass = {
    completed: 'bg-green-500',
    running: 'bg-blue-500 animate-pulse',
    pending: 'bg-yellow-500',
    failed: 'bg-red-500',
    cancelled: 'bg-gray-500',
  }[status] || 'bg-gray-400';

  return <span className={`inline-block w-2 h-2 rounded-full ${colorClass}`} />;
}

function formatDateTime(date: string | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();

  const timeStr = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  if (isToday) {
    return `today at ${timeStr}`;
  }

  return d.toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric'
  }) + ', ' + timeStr;
}

export function RunsTable() {
  const [workflowFilter, setWorkflowFilter] = useWorkflowFilter();
  const [statusFilter, setStatusFilter] = useStatusFilter();
  const [sortOrder, setSortOrder] = useSortOrder();
  const [selectedRuns, setSelectedRuns] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [workflows, setWorkflows] = useState<string[]>([]);

  const limit = 20;
  const cursor = cursors[page - 1];

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (cursor) params.set('cursor', cursor);
    if (workflowFilter && workflowFilter !== ALL_WORKFLOWS) params.set('workflowName', workflowFilter);
    if (statusFilter && statusFilter !== ALL_STATUSES) params.set('status', statusFilter);
    if (sortOrder) params.set('sortOrder', sortOrder);
    return `/api/runs?${params.toString()}`;
  }, [cursor, workflowFilter, statusFilter, sortOrder]);

  const { data, error, isLoading, mutate } = useSWR<RunsResponse>(
    buildUrl(),
    fetcher,
    {
      refreshInterval: 30000,
      onSuccess: () => setLastRefresh(new Date()),
    }
  );

  // Fetch available workflows for the filter
  useEffect(() => {
    fetch('/api/workflows')
      .then((res) => res.json())
      .then((data) => {
        if (data.workflows) {
          setWorkflows(data.workflows);
        }
      })
      .catch(() => {});
  }, []);

  // Update cursors when we get new data
  useEffect(() => {
    if (data?.pagination?.cursor && page === cursors.length) {
      setCursors([...cursors, data.pagination.cursor]);
    }
  }, [data, page, cursors]);

  // Reset pagination when filters change
  useEffect(() => {
    setPage(1);
    setCursors([undefined]);
  }, [workflowFilter, statusFilter, sortOrder]);

  const handleRefresh = () => {
    mutate();
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && data?.runs) {
      setSelectedRuns(new Set(data.runs.map((r) => r.runId)));
    } else {
      setSelectedRuns(new Set());
    }
  };

  const handleSelectRun = (runId: string, checked: boolean) => {
    const newSelected = new Set(selectedRuns);
    if (checked) {
      newSelected.add(runId);
    } else {
      newSelected.delete(runId);
    }
    setSelectedRuns(newSelected);
  };

  const toggleSortOrder = () => {
    setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
  };

  const secondsAgo = Math.floor((new Date().getTime() - lastRefresh.getTime()) / 1000);

  const runs = data?.runs ?? [];
  const hasMore = data?.pagination?.hasMore ?? false;
  const totalPages = hasMore ? page + 1 : page;

  return (
    <div className="space-y-4">
      {/* Filters Row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Last refreshed <span className="text-foreground">{secondsAgo} seconds ago</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Select value={workflowFilter || ALL_WORKFLOWS} onValueChange={(v) => setWorkflowFilter(v === ALL_WORKFLOWS ? '' : v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Workflows" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_WORKFLOWS}>All Workflows</SelectItem>
              {workflows.map((wf) => (
                <SelectItem key={wf} value={wf}>
                  {wf}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter || ALL_STATUSES} onValueChange={(v) => setStatusFilter(v === ALL_STATUSES ? '' : v)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Any status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={toggleSortOrder}>
            <ArrowDownZA className="h-4 w-4 mr-1" />
            {sortOrder === 'desc' ? 'Newest' : 'Oldest'}
          </Button>

          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-destructive text-sm">Failed to load runs: {error.message}</p>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={runs.length > 0 && selectedRuns.size === runs.length}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead>Workflow</TableHead>
              <TableHead>Run ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Completed</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-4" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-4" />
                  </TableCell>
                </TableRow>
              ))
            ) : runs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <div className="text-muted-foreground">
                    <p className="font-medium">No workflow runs found</p>
                    <p className="text-sm">Trigger a workflow to see it appear here</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              runs.map((run) => {
                const duration = formatDuration(run.startedAt, run.completedAt);
                return (
                  <TableRow key={run.runId}>
                    <TableCell>
                      <Checkbox
                        checked={selectedRuns.has(run.runId)}
                        onCheckedChange={(checked) =>
                          handleSelectRun(run.runId, checked as boolean)
                        }
                      />
                    </TableCell>
                    <TableCell className="font-medium">{run.workflowName}</TableCell>
                    <TableCell>
                      <Link
                        href={`/run/${run.runId}`}
                        className="text-primary hover:underline font-mono text-sm"
                      >
                        {run.runId}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <StatusDot status={run.status} />
                        <span className="capitalize">{run.status}</span>
                        {run.status === 'completed' && run.startedAt && (
                          <span className="text-muted-foreground">({duration})</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(run.startedAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(run.completedAt)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/run/${run.runId}`}>View details</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/run/${run.runId}?tab=graph`}>View graph</Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
          {selectedRuns.size > 0 && <span className="ml-2">({selectedRuns.size} selected)</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(page + 1)}
            disabled={!hasMore}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
