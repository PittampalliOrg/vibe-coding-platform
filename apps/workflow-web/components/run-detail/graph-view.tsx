'use client';

import { useMemo } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface StepData {
  stepId: string;
  stepName: string;
  status: string;
  attempt: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

interface GraphViewProps {
  steps: StepData[];
}

const getStatusBorderColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'border-l-green-500';
    case 'running':
      return 'border-l-blue-500';
    case 'pending':
      return 'border-l-yellow-500';
    case 'failed':
      return 'border-l-red-500';
    case 'cancelled':
      return 'border-l-gray-500';
    default:
      return 'border-l-gray-400';
  }
};

function formatDuration(startedAt?: string, completedAt?: string): string {
  if (!startedAt) return '';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const ms = end - start;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface StepNodeData {
  label: string;
  status: string;
  duration: string;
  hasTarget: boolean;
  hasSource: boolean;
}

// Compact node matching Vercel style - dark card with colored left border
function StepNode({ data }: { data: StepNodeData }) {
  return (
    <>
      {data.hasTarget && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-2 !h-2 !bg-green-500 !border-0"
        />
      )}

      <div
        className={cn(
          'px-3 py-2 rounded-md border border-border/50 bg-card/80 min-w-[100px] max-w-[140px]',
          'border-l-[3px]',
          'transition-all duration-150 ease-out hover:bg-card',
          getStatusBorderColor(data.status)
        )}
      >
        <div className="flex items-center gap-1.5">
          <div className={cn(
            'w-1.5 h-1.5 rounded-full shrink-0',
            data.status === 'completed' && 'bg-green-500',
            data.status === 'running' && 'bg-blue-500 animate-pulse',
            data.status === 'pending' && 'bg-yellow-500',
            data.status === 'failed' && 'bg-red-500',
            data.status === 'cancelled' && 'bg-gray-500'
          )} />
          <div className="text-[11px] font-medium truncate text-foreground">{data.label}</div>
        </div>
      </div>

      {data.hasSource && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-2 !h-2 !bg-green-500 !border-0"
        />
      )}
    </>
  );
}

const nodeTypes = {
  stepNode: StepNode,
};

// Status legend component matching Vercel style
function StatusLegend() {
  const statuses = [
    { status: 'completed', label: 'Completed', borderColor: 'border-green-500' },
    { status: 'failed', label: 'Failed', borderColor: 'border-red-500' },
    { status: 'running', label: 'Running', borderColor: 'border-blue-500' },
    { status: 'cancelled', label: 'Cancelled', borderColor: 'border-yellow-500' },
    { status: 'pending', label: 'Pending', borderColor: 'border-gray-500' },
  ];

  return (
    <div className="w-32 border-r border-border/50 p-4 space-y-3 bg-background/30">
      <div className="text-sm font-medium">Status</div>
      <div className="space-y-2.5">
        {statuses.map(({ status, label, borderColor }) => (
          <div key={status} className="flex items-center gap-2.5">
            <div className={cn(
              'w-5 h-3.5 rounded-sm border-2 bg-transparent',
              borderColor
            )} />
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Execution panel component
function ExecutionPanel({ steps }: { steps: StepData[] }) {
  const completedSteps = steps.filter((s) => s.status === 'completed').length;
  const failedSteps = steps.filter((s) => s.status === 'failed').length;
  const totalSteps = steps.length;

  // Determine overall status
  let overallStatus = 'running';
  if (failedSteps > 0) {
    overallStatus = 'failed';
  } else if (completedSteps === totalSteps) {
    overallStatus = 'completed';
  }

  return (
    <div className="w-40 border-l p-4 space-y-4 bg-background/50">
      <div className="text-sm font-medium">Execution</div>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Status:</span>
          <Badge
            variant="outline"
            className={cn(
              'text-xs px-2 py-0.5',
              overallStatus === 'completed' && 'border-green-500 text-green-500',
              overallStatus === 'failed' && 'border-red-500 text-red-500',
              overallStatus === 'running' && 'border-blue-500 text-blue-500'
            )}
          >
            {overallStatus}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Progress:</span>
          <span className="text-sm font-medium">
            {completedSteps} / {totalSteps}
          </span>
        </div>
      </div>
    </div>
  );
}

export function GraphView({ steps }: GraphViewProps) {
  const { initialNodes, initialEdges } = useMemo(() => {
    if (steps.length === 0) {
      return { initialNodes: [], initialEdges: [] };
    }

    const sortedSteps = [...steps].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Vertical layout (single column, top-to-bottom like Vercel)
    const verticalSpacing = 70;
    const centerX = 200; // Center nodes horizontally

    const nodes: Node[] = sortedSteps.map((step, index) => {
      return {
        id: step.stepId,
        type: 'stepNode',
        position: {
          x: centerX,
          y: index * verticalSpacing + 20,
        },
        data: {
          label: step.stepName,
          status: step.status,
          duration: formatDuration(step.startedAt, step.completedAt),
          hasTarget: index > 0,
          hasSource: index < sortedSteps.length - 1,
        },
      };
    });

    const edges: Edge[] = [];
    for (let i = 0; i < sortedSteps.length - 1; i++) {
      const currentStep = sortedSteps[i];
      const nextStep = sortedSteps[i + 1];
      const isAnimated = nextStep.status === 'running';
      const isError = currentStep.status === 'failed';

      edges.push({
        id: `e-${currentStep.stepId}-${nextStep.stepId}`,
        source: currentStep.stepId,
        target: nextStep.stepId,
        type: 'smoothstep',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isError ? '#ef4444' : isAnimated ? '#3b82f6' : '#6b7280',
          width: 12,
          height: 12,
        },
        style: {
          stroke: isError ? '#ef4444' : isAnimated ? '#3b82f6' : '#6b7280',
          strokeWidth: 1.5,
        },
        animated: isAnimated,
      });
    }

    return { initialNodes: nodes, initialEdges: edges };
  }, [steps]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  if (steps.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No steps recorded for this workflow run
      </div>
    );
  }

  return (
    <div className="flex h-[400px] border rounded-lg overflow-hidden bg-background">
      {/* Left sidebar - Status legend */}
      <StatusLegend />

      {/* Center - Graph */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.4, maxZoom: 1.5, minZoom: 0.5 }}
          proOptions={{ hideAttribution: true }}
          panOnScroll
          panOnDrag
          zoomOnDoubleClick={false}
          deleteKeyCode={null}
        >
          <Background gap={20} size={1} color="hsl(var(--muted-foreground) / 0.1)" />
          <Controls
            showInteractive={false}
            position="bottom-right"
            className="!bg-background !border !border-border !shadow-md [&>button]:!bg-background [&>button]:!border-border [&>button]:hover:!bg-muted [&>button]:!text-foreground"
          />
        </ReactFlow>
      </div>

      {/* Right sidebar - Execution panel */}
      <ExecutionPanel steps={steps} />
    </div>
  );
}
