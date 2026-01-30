'use client';

import Link from 'next/link';
import { ChevronRight, RotateCcw, Zap, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RunHeaderProps {
  runId: string;
  workflowName: string;
  status: string;
  onReplay?: () => void;
  onWakeUp?: () => void;
  onCancel?: () => void;
}

export function RunHeader({
  runId,
  workflowName,
  status,
  onReplay,
  onWakeUp,
  onCancel,
}: RunHeaderProps) {
  const isRunning = status === 'running';
  const isPending = status === 'pending';
  const canCancel = isRunning || isPending;

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground transition-colors">
          Runs
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground font-medium">
          {runId}
        </span>
      </nav>

      {/* Title Row */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{workflowName}</h1>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Live indicator - shows for running workflows */}
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

          {/* Replay button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onReplay}
            className="gap-1.5"
          >
            <RotateCcw className="h-4 w-4" />
            Replay
          </Button>

          {/* Wake up button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onWakeUp}
            disabled={!isPending}
            className="gap-1.5"
          >
            <Zap className="h-4 w-4" />
            Wake up
          </Button>

          {/* Cancel button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={!canCancel}
            className="gap-1.5"
          >
            <XCircle className="h-4 w-4" />
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
