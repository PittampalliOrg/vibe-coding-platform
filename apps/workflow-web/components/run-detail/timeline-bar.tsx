'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface TimelineBarProps {
  stepName: string;
  status: string;
  startTime: number;
  endTime: number;
  totalDuration: number;
  onClick?: () => void;
  isSelected?: boolean;
  isParent?: boolean;
  hasParent?: boolean;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// Tooltip component for dots
function DotTooltip({
  children,
  content,
  visible
}: {
  children: React.ReactNode;
  content: string;
  visible: boolean;
}) {
  return (
    <div className="relative group">
      {children}
      {visible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-popover border border-border rounded text-xs font-medium whitespace-nowrap z-20 shadow-md">
          {content}
        </div>
      )}
    </div>
  );
}

const getBarColor = (status: string, isParent: boolean) => {
  if (isParent) {
    // Parent span uses teal/green color like Vercel
    switch (status) {
      case 'completed':
        return 'bg-teal-600';
      case 'running':
        return 'bg-teal-500 animate-pulse';
      case 'failed':
        return 'bg-red-600';
      default:
        return 'bg-teal-500';
    }
  }
  // Child spans use amber/orange
  switch (status) {
    case 'completed':
      return 'bg-amber-500';
    case 'running':
      return 'bg-amber-400 animate-pulse';
    case 'pending':
      return 'bg-yellow-500';
    case 'failed':
      return 'bg-red-500';
    case 'cancelled':
      return 'bg-gray-500';
    default:
      return 'bg-gray-400';
  }
};

const getStartDotColor = (status: string, isParent: boolean) => {
  if (isParent) {
    return 'bg-green-500';
  }
  switch (status) {
    case 'completed':
      return 'bg-blue-500';
    case 'running':
      return 'bg-blue-400';
    case 'pending':
      return 'bg-yellow-500';
    case 'failed':
      return 'bg-red-500';
    default:
      return 'bg-gray-400';
  }
};

const getEndDotColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'bg-green-400';
    case 'failed':
      return 'bg-red-400';
    default:
      return 'bg-gray-400';
  }
};

export function TimelineBar({
  stepName,
  status,
  startTime,
  endTime,
  totalDuration,
  onClick,
  isSelected,
  isParent = false,
  hasParent = false,
}: TimelineBarProps) {
  const [hoveredDot, setHoveredDot] = useState<'start' | 'end' | null>(null);

  const leftPercent = totalDuration > 0 ? (startTime / totalDuration) * 100 : 0;
  const widthPercent = totalDuration > 0 ? ((endTime - startTime) / totalDuration) * 100 : 0;
  const minWidth = 2;
  const duration = endTime - startTime;
  const durationLabel = formatDuration(duration);
  const tooltipContent = `${stepName} ${durationLabel}`;

  // Show label outside bar if bar is too small (less than 12% width)
  const showLabelOutside = widthPercent < 12;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex items-center w-full hover:bg-muted/50 rounded transition-colors',
        isParent ? 'h-9' : 'h-8',
        hasParent && !isParent && 'pl-4',
        isSelected && 'bg-muted/70'
      )}
    >
      {/* Step name with tree structure for child spans */}
      <div className={cn(
        'shrink-0 px-2 text-sm text-left truncate flex items-center',
        isParent ? 'w-44 font-medium' : 'w-40'
      )}>
        {hasParent && !isParent && (
          <div className="flex items-center mr-2">
            {/* Vertical line connector */}
            <span className="w-px h-full bg-green-500/40 absolute left-6 top-0 bottom-0" />
            {/* Horizontal connector with dot */}
            <span className="w-2 h-px bg-green-500/40" />
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 ml-0.5" />
          </div>
        )}
        {isParent && (
          <span className="w-2 h-2 rounded-full bg-green-500 mr-2 shrink-0" />
        )}
        <span className="truncate">{stepName}</span>
      </div>

      {/* Timeline bar area */}
      <div className="flex-1 relative h-6">
        {/* Start dot indicator with tooltip */}
        <DotTooltip content={tooltipContent} visible={hoveredDot === 'start'}>
          <div
            className={cn(
              'absolute rounded-full top-1/2 -translate-y-1/2 z-10 cursor-pointer hover:scale-125 transition-transform',
              getStartDotColor(status, isParent),
              isParent ? 'w-2.5 h-2.5' : 'w-2 h-2'
            )}
            style={{
              left: `${leftPercent}%`,
            }}
            onMouseEnter={() => setHoveredDot('start')}
            onMouseLeave={() => setHoveredDot(null)}
          />
        </DotTooltip>

        {/* The bar itself */}
        <div
          className={cn(
            'absolute rounded',
            getBarColor(status, isParent),
            'transition-all duration-200 flex items-center justify-end pr-2',
            isParent ? 'top-1 bottom-1' : 'top-1.5 bottom-1.5',
            isSelected && 'ring-2 ring-foreground ring-offset-1 ring-offset-background'
          )}
          style={{
            left: `calc(${leftPercent}% + 6px)`,
            width: `calc(max(${widthPercent}%, ${minWidth}%) - 12px)`,
          }}
        >
          {/* Duration label inside bar (always show for parent, conditionally for children) */}
          {(isParent || !showLabelOutside) && (
            <span className={cn(
              'font-medium text-white drop-shadow-sm whitespace-nowrap',
              isParent ? 'text-sm' : 'text-xs'
            )}>
              {durationLabel}
            </span>
          )}
        </div>

        {/* End dot indicator with tooltip */}
        {(status === 'completed' || status === 'failed') && (
          <DotTooltip content={tooltipContent} visible={hoveredDot === 'end'}>
            <div
              className={cn(
                'absolute rounded-full top-1/2 -translate-y-1/2 z-10 cursor-pointer hover:scale-125 transition-transform',
                getEndDotColor(status),
                isParent ? 'w-2.5 h-2.5' : 'w-2 h-2'
              )}
              style={{
                left: `calc(${leftPercent}% + max(${widthPercent}%, ${minWidth}%))`,
              }}
              onMouseEnter={() => setHoveredDot('end')}
              onMouseLeave={() => setHoveredDot(null)}
            />
          </DotTooltip>
        )}

        {/* Duration label outside bar (for small child bars) */}
        {!isParent && showLabelOutside && (
          <span
            className="absolute top-1 bottom-1 flex items-center text-xs font-medium text-amber-400 whitespace-nowrap pl-2"
            style={{
              left: `calc(${leftPercent}% + max(${widthPercent}%, ${minWidth}%) + 4px)`,
            }}
          >
            ●{durationLabel}
          </span>
        )}
      </div>
    </button>
  );
}
