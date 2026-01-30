'use client';

import { formatDuration } from '@/lib/utils';

interface RunMetadataProps {
  status: string;
  runId: string;
  queuedAt?: string;
  startedAt?: string;
  completedAt?: string;
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

function MetadataItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export function RunMetadata({
  status,
  runId,
  queuedAt,
  startedAt,
  completedAt,
}: RunMetadataProps) {
  const duration = formatDuration(startedAt, completedAt);

  return (
    <div className="flex flex-wrap items-start gap-x-10 gap-y-3 py-4">
      {/* Status */}
      <MetadataItem label="Status">
        <div className="flex items-center gap-1.5">
          <StatusDot status={status} />
          <span className="capitalize">{status}</span>
        </div>
      </MetadataItem>

      {/* Duration */}
      <MetadataItem label="Duration">
        <span className="font-medium">{duration}</span>
      </MetadataItem>

      {/* Run ID */}
      <MetadataItem label="Run ID">
        <span className="font-mono text-xs">{runId}</span>
      </MetadataItem>

      {/* Queued */}
      <MetadataItem label="Queued">
        <span>{formatDateTime(queuedAt)}</span>
      </MetadataItem>

      {/* Started */}
      <MetadataItem label="Started">
        <span>{formatDateTime(startedAt)}</span>
      </MetadataItem>

      {/* Completed */}
      <MetadataItem label="Completed">
        <span>{formatDateTime(completedAt)}</span>
      </MetadataItem>
    </div>
  );
}
