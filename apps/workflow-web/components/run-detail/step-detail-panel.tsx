'use client';

import { X, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/utils';

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

interface StepDetailPanelProps {
  step: StepData;
  events: EventData[];
  onClose: () => void;
  runId?: string;
}

function formatJson(data: unknown): string {
  if (data === undefined || data === null) return '-';
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function formatTimestamp(dateStr?: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return `${d.toLocaleDateString('en-US')}, ${d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: true
  })}`;
}

export function StepDetailPanel({ step, events, onClose, runId }: StepDetailPanelProps) {
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [expandedEventData, setExpandedEventData] = useState<Set<string>>(new Set());

  const toggleEvent = (eventId: string) => {
    const newExpanded = new Set(expandedEvents);
    if (newExpanded.has(eventId)) {
      newExpanded.delete(eventId);
    } else {
      newExpanded.add(eventId);
    }
    setExpandedEvents(newExpanded);
  };

  const toggleEventData = (eventId: string) => {
    const newExpanded = new Set(expandedEventData);
    if (newExpanded.has(eventId)) {
      newExpanded.delete(eventId);
    } else {
      newExpanded.add(eventId);
    }
    setExpandedEventData(newExpanded);
  };

  const stepEvents = events.filter(
    (e) => e.eventType.includes(step.stepName) || e.eventType.includes(step.stepId)
  );

  const duration = formatDuration(step.startedAt, step.completedAt);

  return (
    <div className="w-80 border-l border-border/50 bg-card/50 flex flex-col h-full">
      {/* Header - step name with duration and close button */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <h3 className="text-sm font-medium truncate">{step.stepName}</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{duration}</span>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6 shrink-0">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {/* Metadata table like Vercel */}
        <div className="border-b border-border/50">
          {runId && (
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
              <span className="text-xs text-muted-foreground">runId</span>
              <span className="text-xs font-mono truncate max-w-[180px]">{runId}</span>
            </div>
          )}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
            <span className="text-xs text-muted-foreground">createdAt</span>
            <span className="text-xs">{formatTimestamp(step.createdAt)}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
            <span className="text-xs text-muted-foreground">completedAt</span>
            <span className="text-xs">{formatTimestamp(step.completedAt)}</span>
          </div>
          {step.startedAt && (
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs text-muted-foreground">startedAt</span>
              <span className="text-xs">{formatTimestamp(step.startedAt)}</span>
            </div>
          )}
        </div>

        {/* Error */}
        {step.error && (
          <div className="px-4 py-3 border-b border-border/50">
            <div className="text-xs text-destructive font-medium mb-1">Error</div>
            <div className="text-xs bg-destructive/10 p-2 rounded text-destructive">
              {step.error.message}
            </div>
          </div>
        )}

        {/* Events section */}
        <div className="px-4 py-3">
          <h4 className="text-sm font-medium mb-3">
            Events ({stepEvents.length || events.length})
          </h4>
          <div className="space-y-1">
            {(stepEvents.length > 0 ? stepEvents : events).map((event) => (
              <div key={event.eventId} className="rounded bg-muted/50">
                <button
                  type="button"
                  onClick={() => toggleEvent(event.eventId)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted transition-colors rounded"
                >
                  {expandedEvents.has(event.eventId) ? (
                    <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                  <span className="text-xs font-medium">{event.eventType}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                    - {formatTimestamp(event.createdAt)}
                  </span>
                </button>
                {expandedEvents.has(event.eventId) && (
                  <div className="px-3 pb-2 space-y-1">
                    <div className="flex items-center justify-between py-1 border-b border-border/20">
                      <span className="text-[10px] text-muted-foreground">eventId</span>
                      <span className="text-[10px] font-mono truncate max-w-[160px]">{event.eventId}</span>
                    </div>
                    {event.eventData !== undefined && (
                      <div className="pt-2">
                        <span className="text-[10px] text-muted-foreground block mb-1">eventData</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleEventData(event.eventId);
                          }}
                          className="text-[10px] text-foreground flex items-center gap-1 hover:text-muted-foreground transition-colors font-medium"
                        >
                          {expandedEventData.has(event.eventId) ? (
                            <ChevronDown className="h-2.5 w-2.5" />
                          ) : (
                            <ChevronRight className="h-2.5 w-2.5" />
                          )}
                          Event Data
                        </button>
                        {expandedEventData.has(event.eventId) && (
                          <pre className="mt-2 p-2 bg-muted/30 rounded text-[10px] font-mono overflow-auto max-h-40 whitespace-pre-wrap break-all border border-border/30">
                            {formatJson(event.eventData)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
