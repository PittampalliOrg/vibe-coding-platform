'use client';

import { formatDate } from '@/lib/utils';

interface EventData {
  eventId: string;
  eventType: string;
  eventData?: unknown;
  createdAt: string;
}

interface StreamsViewProps {
  events: EventData[];
  input?: unknown;
  output?: unknown;
  error?: { message: string; stack?: string };
}

function formatJson(data: unknown): string {
  if (data === undefined) return '-';
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export function StreamsView({ events, input, output, error }: StreamsViewProps) {
  const hasContent = events.length > 0 || input !== undefined || output !== undefined || error;

  if (!hasContent) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No output streams available for this workflow run
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Input Stream */}
      {input !== undefined && (
        <div className="rounded-lg border bg-card">
          <div className="px-4 py-2 border-b bg-muted/30">
            <h3 className="font-medium text-sm">Input</h3>
          </div>
          <pre className="p-4 text-sm overflow-auto max-h-48 font-mono">
            {formatJson(input)}
          </pre>
        </div>
      )}

      {/* Output Stream */}
      {output !== undefined && (
        <div className="rounded-lg border bg-card">
          <div className="px-4 py-2 border-b bg-muted/30">
            <h3 className="font-medium text-sm">Output</h3>
          </div>
          <pre className="p-4 text-sm overflow-auto max-h-48 font-mono">
            {formatJson(output)}
          </pre>
        </div>
      )}

      {/* Error Stream */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5">
          <div className="px-4 py-2 border-b border-destructive/50 bg-destructive/10">
            <h3 className="font-medium text-sm text-destructive">Error</h3>
          </div>
          <div className="p-4">
            <p className="text-sm text-destructive font-medium">{error.message}</p>
            {error.stack && (
              <pre className="mt-2 text-xs overflow-auto max-h-32 text-destructive/80 font-mono">
                {error.stack}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Event Stream */}
      {events.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="px-4 py-2 border-b bg-muted/30">
            <h3 className="font-medium text-sm">Events ({events.length})</h3>
          </div>
          <div className="divide-y max-h-96 overflow-auto">
            {events.map((event) => (
              <div key={event.eventId} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">{event.eventType}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(event.createdAt)}
                  </span>
                </div>
                {event.eventData !== undefined && event.eventData !== null && (
                  <pre className="text-xs bg-muted p-2 rounded-md overflow-auto max-h-24 font-mono">
                    {formatJson(event.eventData)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
