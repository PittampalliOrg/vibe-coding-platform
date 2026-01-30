'use client';

import { useEffect, useState } from 'react';
import { useParams, notFound } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ChevronRight, RotateCcw, Zap, XCircle, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  RunTabs,
  TraceView,
  GraphView,
  StreamsView,
} from '@/components/run-detail';
import { formatDuration } from '@/lib/utils';

interface RunData {
  runId: string;
  workflowName: string;
  deploymentId: string;
  status: string;
  input?: unknown;
  output?: unknown;
  error?: { message: string; stack?: string; code?: string };
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

interface StepData {
  stepId: string;
  stepName: string;
  status: string;
  attempt: number;
  input?: unknown;
  output?: unknown;
  error?: { message: string };
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

interface EventData {
  eventId: string;
  eventType: string;
  eventData?: unknown;
  createdAt: string;
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

export default function RunDetailPage() {
  const params = useParams();
  const runId = params.runId as string;

  const [run, setRun] = useState<RunData | null>(null);
  const [steps, setSteps] = useState<StepData[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundState, setNotFoundState] = useState(false);

  useEffect(() => {
    const fetchRunDetails = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/runs/${runId}`);
        if (response.status === 404) {
          setNotFoundState(true);
          return;
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        setRun(data.run);
        setSteps(data.steps || []);
        setEvents(data.events || []);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load run details');
      } finally {
        setLoading(false);
      }
    };

    if (runId) {
      fetchRunDetails();
    }
  }, [runId]);

  if (notFoundState) {
    notFound();
  }

  if (loading) {
    return (
      <div className="container mx-auto py-6 px-4 space-y-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <p className="text-destructive">Run not found</p>
        </div>
      </div>
    );
  }

  const isRunning = run.status === 'running';
  const isPending = run.status === 'pending';
  const canCancel = isRunning || isPending;
  const duration = formatDuration(run.startedAt, run.completedAt);

  return (
    <div className="container mx-auto py-6 px-4 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground transition-colors">
          Runs
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground font-medium">{runId}</span>
      </nav>

      {/* Main Card with Title, Actions, and Metadata */}
      <div className="rounded-lg border border-border/50 bg-card/50 p-6 space-y-4">
        {/* Title Row with Actions */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{run.workflowName}</h1>

          <div className="flex items-center gap-2">
            {/* Live indicator - always visible, styled based on status */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-sm">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  isRunning
                    ? 'bg-green-500 animate-pulse'
                    : 'bg-muted-foreground/30'
                }`}
              />
              <span className={isRunning ? 'text-foreground' : 'text-muted-foreground'}>
                Live
              </span>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5">
              <RotateCcw className="h-4 w-4" />
              Replay
            </Button>
            <Button variant="outline" size="sm" disabled={!isPending} className="gap-1.5">
              <Zap className="h-4 w-4" />
              Wake up
            </Button>
            <Button variant="outline" size="sm" disabled={!canCancel} className="gap-1.5">
              <XCircle className="h-4 w-4" />
              Cancel
            </Button>
          </div>
        </div>

        {/* Metadata Row */}
        <div className="flex flex-wrap items-start gap-x-10 gap-y-3 text-sm">
          <div className="space-y-1">
            <div className="text-muted-foreground">Status</div>
            <div className="flex items-center gap-1.5 font-medium">
              <StatusDot status={run.status} />
              <span className="capitalize">{run.status}</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-muted-foreground">Duration</div>
            <div className="font-medium">{duration}</div>
          </div>

          <div className="space-y-1">
            <div className="text-muted-foreground">Run ID</div>
            <div className="font-mono text-xs">{runId}</div>
          </div>

          <div className="space-y-1">
            <div className="text-muted-foreground">Queued</div>
            <div>{formatDateTime(run.createdAt)}</div>
          </div>

          <div className="space-y-1">
            <div className="text-muted-foreground">Started</div>
            <div>{formatDateTime(run.startedAt)}</div>
          </div>

          <div className="space-y-1">
            <div className="text-muted-foreground">Completed</div>
            <div>{formatDateTime(run.completedAt)}</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <p className="text-destructive">{error}</p>
        </div>
      )}

      {/* Tabs: Trace / Graph / Streams */}
      <RunTabs
        traceContent={
          <TraceView
            steps={steps}
            events={events}
            runStartedAt={run.startedAt}
            runCompletedAt={run.completedAt}
            runId={runId}
            workflowName={run.workflowName}
          />
        }
        graphContent={<GraphView steps={steps} />}
        streamsContent={
          <StreamsView
            events={events}
            input={run.input}
            output={run.output}
            error={run.error}
          />
        }
      />
    </div>
  );
}
