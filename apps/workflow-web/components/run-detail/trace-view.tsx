'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import { ZoomIn, ZoomOut, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TimelineBar } from './timeline-bar';
import { StepDetailPanel } from './step-detail-panel';

// Format time value for tooltip display
function formatTimeValue(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
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
  parentStepId?: string;
}

interface EventData {
  eventId: string;
  eventType: string;
  eventData?: unknown;
  createdAt: string;
}

interface TraceViewProps {
  steps: StepData[];
  events: EventData[];
  runStartedAt?: string;
  runCompletedAt?: string;
  runId?: string;
  workflowName?: string;
}

function getTimeValue(dateStr: string | undefined, fallback: number): number {
  if (!dateStr) return fallback;
  return new Date(dateStr).getTime();
}

// Timeline Overview Bar Component - matches Vercel's minimal gray style
function TimelineOverview({
  steps,
  totalDuration,
  minTime,
  workflowName,
}: {
  steps: StepData[];
  totalDuration: number;
  minTime: number;
  workflowName?: string;
}) {
  if (totalDuration === 0) return null;

  return (
    <div className="relative h-4 bg-muted/20 rounded-sm border border-border/30">
      {/* Fine grid lines for scale reference */}
      <div className="absolute inset-0 flex">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 border-r border-border/20 last:border-r-0"
          />
        ))}
      </div>

      {/* Parent workflow span (full width teal bar) */}
      {workflowName && (
        <div className="absolute top-0.5 bottom-0.5 left-0 right-0 rounded-[2px] bg-teal-600/30" />
      )}

      {/* Step indicators as vertical ticks/thin bars */}
      {steps.map((step) => {
        const startTime = getTimeValue(step.startedAt, minTime) - minTime;
        const endTime = getTimeValue(step.completedAt, getTimeValue(step.startedAt, minTime) + 100) - minTime;
        const leftPercent = (startTime / totalDuration) * 100;
        const widthPercent = Math.max(((endTime - startTime) / totalDuration) * 100, 1);

        return (
          <div
            key={step.stepId}
            className="absolute top-0.5 bottom-0.5 rounded-[2px] bg-amber-500/50"
            style={{
              left: `${leftPercent}%`,
              width: `${widthPercent}%`,
            }}
          />
        );
      })}
    </div>
  );
}

export function TraceView({ steps, events, runStartedAt, runCompletedAt, runId, workflowName }: TraceViewProps) {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [hoverTime, setHoverTime] = useState<{ x: number; time: number } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const timelineAreaRef = useRef<HTMLDivElement>(null);

  const selectedStep = steps.find((s) => s.stepId === selectedStepId);

  const { timeMarkers, totalDuration, minTime } = useMemo(() => {
    if (steps.length === 0) {
      return { timeMarkers: [], totalDuration: 0, minTime: 0 };
    }

    const startTime = runStartedAt ? new Date(runStartedAt).getTime() : Date.now();
    const endTime = runCompletedAt
      ? new Date(runCompletedAt).getTime()
      : Math.max(
          ...steps.map((s) =>
            getTimeValue(s.completedAt, getTimeValue(s.startedAt, startTime))
          )
        );

    const duration = Math.max(endTime - startTime, 100); // Ensure minimum duration
    const markerCount = 10;
    const markers = [];

    for (let i = 0; i <= markerCount; i++) {
      const time = (duration / markerCount) * i;
      markers.push({
        position: (i / markerCount) * 100,
        label: time < 1000 ? `${Math.round(time)}ms` : `${(time / 1000).toFixed(1)}s`,
      });
    }

    return {
      timeMarkers: markers,
      totalDuration: duration,
      minTime: startTime,
    };
  }, [steps, runStartedAt, runCompletedAt]);

  const handleZoomIn = () => setZoom((z) => Math.min(z * 1.5, 4));
  const handleZoomOut = () => setZoom((z) => Math.max(z / 1.5, 0.5));
  const handleZoomReset = () => setZoom(1);

  // Handle mouse move to show time position tooltip
  const handleTimelineMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineAreaRef.current || totalDuration === 0) return;

    const rect = timelineAreaRef.current.getBoundingClientRect();
    const nameColumnWidth = 160; // w-40 = 10rem = 160px
    const timelineStart = rect.left + nameColumnWidth;
    const timelineWidth = rect.width - nameColumnWidth;

    const relativeX = e.clientX - timelineStart;
    if (relativeX < 0 || relativeX > timelineWidth) {
      setHoverTime(null);
      return;
    }

    const timePercent = relativeX / timelineWidth;
    const time = timePercent * totalDuration;
    setHoverTime({ x: e.clientX - rect.left, time });
  }, [totalDuration]);

  const handleTimelineMouseLeave = useCallback(() => {
    setHoverTime(null);
  }, []);

  if (steps.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No steps recorded for this workflow run
      </div>
    );
  }

  // Calculate workflow-level span (parent) data
  const workflowDuration = totalDuration;

  return (
    <div className="flex h-[500px] border border-border/50 rounded-lg overflow-hidden bg-card/30">
      {/* Left side: Timeline */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Timeline Overview Bar */}
        <div className="px-2 pt-3 pb-2">
          <TimelineOverview
            steps={steps}
            totalDuration={totalDuration}
            minTime={minTime}
          />
        </div>

        {/* Main Timeline Area */}
        <div
          ref={timelineAreaRef}
          className="flex-1 flex flex-col overflow-hidden relative"
          onMouseMove={handleTimelineMouseMove}
          onMouseLeave={handleTimelineMouseLeave}
        >
        {/* Time Position Hover Tooltip */}
        {hoverTime && (
          <div
            className="absolute top-0 z-20 pointer-events-none"
            style={{ left: hoverTime.x }}
          >
            {/* Vertical line indicator */}
            <div className="absolute top-0 bottom-0 w-px bg-muted-foreground/30 h-full" style={{ height: '100%' }} />
            {/* Time badge */}
            <div className="absolute top-1 -translate-x-1/2 bg-muted border border-border rounded px-1.5 py-0.5 text-[10px] font-mono text-foreground whitespace-nowrap">
              {formatTimeValue(hoverTime.time)}
            </div>
          </div>
        )}

        {/* Time Markers */}
        <div className="flex items-center h-8 px-2 border-b bg-muted/20">
          <div className="w-40 shrink-0" />
          <div className="flex-1 relative">
            {timeMarkers.map((marker, i) => (
              <div
                key={i}
                className="absolute text-[11px] text-muted-foreground font-mono"
                style={{ left: `${marker.position}%`, transform: 'translateX(-50%)' }}
              >
                {marker.label}
              </div>
            ))}
          </div>
        </div>

        {/* Timeline Bars */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-auto scrollbar-thin scrollbar-track-muted/30 scrollbar-thumb-muted-foreground/30 hover:scrollbar-thumb-muted-foreground/50"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255,255,255,0.2) rgba(255,255,255,0.05)',
          }}
        >
          <div
            className="p-2 space-y-1"
            style={{ minWidth: `${zoom * 100}%` }}
          >
            {/* Parent workflow span */}
            {workflowName && (
              <TimelineBar
                stepName={workflowName}
                status="completed"
                startTime={0}
                endTime={workflowDuration}
                totalDuration={totalDuration}
                onClick={() => setSelectedStepId(null)}
                isSelected={false}
                isParent={true}
              />
            )}

            {/* Child step spans */}
            {steps.map((step) => {
              const startTime = getTimeValue(step.startedAt, minTime) - minTime;
              const endTime = getTimeValue(step.completedAt, getTimeValue(step.startedAt, minTime) + 100) - minTime;

              return (
                <TimelineBar
                  key={step.stepId}
                  stepName={step.stepName}
                  status={step.status}
                  startTime={startTime}
                  endTime={endTime}
                  totalDuration={totalDuration}
                  onClick={() =>
                    setSelectedStepId(selectedStepId === step.stepId ? null : step.stepId)
                  }
                  isSelected={selectedStepId === step.stepId}
                  isParent={false}
                  hasParent={!!workflowName}
                />
              );
            })}
          </div>
        </div>

        {/* Zoom Controls - Bottom Right */}
        <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-background/80 backdrop-blur-sm rounded-md border border-border/50 p-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomReset}>
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomOut}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      </div>

      {/* Step Detail Panel - Right Side */}
      {selectedStep && (
        <StepDetailPanel
          step={selectedStep}
          events={events}
          onClose={() => setSelectedStepId(null)}
          runId={runId}
        />
      )}
    </div>
  );
}
