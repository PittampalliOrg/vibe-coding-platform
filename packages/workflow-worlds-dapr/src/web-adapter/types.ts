/**
 * Type definitions for @workflow/world compatibility layer
 *
 * These types match the interface expected by @workflow/web for observability.
 * They bridge between our DaprStorage format and Vercel's World interface.
 */

// ============================================================================
// Vercel @workflow/world Compatible Types
// ============================================================================

/**
 * Workflow run status (matches Vercel's WorkflowRunStatusSchema)
 */
export type VercelRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Step status (matches Vercel's StepStatusSchema)
 */
export type VercelStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

/**
 * Structured error type (matches Vercel's StructuredError)
 */
export interface StructuredError {
  message: string;
  stack?: string;
  code?: string;
}

/**
 * Serialized data type (matches Vercel's SerializedData)
 * In Vercel's world, this is typically any[] for CBOR serialization
 */
export type SerializedData = unknown;

/**
 * Workflow run (matches Vercel's WorkflowRun interface)
 */
export interface VercelWorkflowRun {
  runId: string;
  workflowName: string;
  deploymentId: string;
  status: VercelRunStatus;
  specVersion?: number;
  executionContext?: Record<string, unknown>;
  input: SerializedData;
  output?: SerializedData;
  error?: StructuredError;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  expiredAt?: Date;
}

/**
 * Workflow run without input/output data (for listing)
 */
export type VercelWorkflowRunWithoutData = Omit<VercelWorkflowRun, 'input' | 'output'> & {
  input: undefined;
  output: undefined;
};

/**
 * Step (matches Vercel's Step interface)
 */
export interface VercelStep {
  stepId: string;
  runId: string;
  stepName: string;
  status: VercelStepStatus;
  attempt: number;
  input?: SerializedData;
  output?: SerializedData;
  error?: StructuredError;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  retryAfter?: Date;
  specVersion?: number;
}

/**
 * Step without input/output data (for listing)
 */
export type VercelStepWithoutData = Omit<VercelStep, 'input' | 'output'> & {
  input: undefined;
  output: undefined;
};

/**
 * Event (matches Vercel's Event interface)
 */
export interface VercelEvent {
  eventId: string;
  runId: string;
  eventType: string;
  correlationId?: string;
  eventData?: unknown;
  createdAt: Date;
  specVersion?: number;
}

/**
 * Hook (matches Vercel's Hook interface)
 */
export interface VercelHook {
  hookId: string;
  runId: string;
  token: string;
  ownerId: string;
  projectId: string;
  environment: string;
  metadata?: SerializedData;
  createdAt: Date;
  specVersion?: number;
}

// ============================================================================
// Pagination Types
// ============================================================================

export interface PaginationOptions {
  limit?: number;
  cursor?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  hasMore: boolean;
  cursor: string | null;
}

// ============================================================================
// Query Parameter Types
// ============================================================================

export type ResolveData = 'all' | 'none';

export interface GetWorkflowRunParams {
  resolveData?: ResolveData;
}

export interface ListWorkflowRunsParams {
  workflowName?: string;
  status?: VercelRunStatus;
  pagination?: PaginationOptions;
  resolveData?: ResolveData;
}

export interface GetStepParams {
  resolveData?: ResolveData;
}

export interface ListWorkflowRunStepsParams {
  runId: string;
  pagination?: PaginationOptions;
  resolveData?: ResolveData;
}

export interface ListEventsParams {
  runId: string;
  pagination?: PaginationOptions;
}

export interface ListEventsByCorrelationIdParams {
  correlationId: string;
  pagination?: PaginationOptions;
}

export interface GetHookParams {
  resolveData?: ResolveData;
}

export interface ListHooksParams {
  runId: string;
  pagination?: PaginationOptions;
}

// ============================================================================
// Event Creation Types (for event-sourced storage)
// ============================================================================

/**
 * Event types that can be created
 */
export type EventType =
  | 'run_created'
  | 'run_started'
  | 'run_completed'
  | 'run_failed'
  | 'run_cancelled'
  | 'step_started'
  | 'step_completed'
  | 'step_failed'
  | 'step_skipped'
  | 'hook_created'
  | 'hook_disposed';

export interface CreateEventParams {
  correlationId?: string;
}

/**
 * Run created event request
 */
export interface RunCreatedEventRequest {
  eventType: 'run_created';
  workflowName: string;
  deploymentId: string;
  input: SerializedData;
  executionContext?: Record<string, unknown>;
}

/**
 * Generic event request
 */
export interface CreateEventRequest {
  eventType: EventType;
  [key: string]: unknown;
}

/**
 * Result of creating an event
 */
export interface EventResult {
  event: VercelEvent;
  run?: VercelWorkflowRun;
  step?: VercelStep;
  hook?: VercelHook;
}

// ============================================================================
// Streamer Types
// ============================================================================

export interface VercelStreamer {
  writeToStream(
    name: string,
    runId: string | Promise<string>,
    chunk: string | Uint8Array
  ): Promise<void>;
  closeStream(name: string, runId: string | Promise<string>): Promise<void>;
  readFromStream(
    name: string,
    startIndex?: number
  ): Promise<ReadableStream<Uint8Array>>;
  listStreamsByRunId(runId: string): Promise<string[]>;
}

// ============================================================================
// Storage Interface (Vercel @workflow/world compatible)
// ============================================================================

/**
 * Simplified Storage interface for practical use
 * Uses union types instead of overloaded signatures to avoid TypeScript complexity
 */
export interface VercelStorage {
  runs: {
    get(
      id: string,
      params?: GetWorkflowRunParams
    ): Promise<VercelWorkflowRun | VercelWorkflowRunWithoutData>;

    list(
      params?: ListWorkflowRunsParams
    ): Promise<PaginatedResponse<VercelWorkflowRun | VercelWorkflowRunWithoutData>>;
  };

  steps: {
    get(
      runId: string | undefined,
      stepId: string,
      params?: GetStepParams
    ): Promise<VercelStep | VercelStepWithoutData>;

    list(
      params: ListWorkflowRunStepsParams
    ): Promise<PaginatedResponse<VercelStep | VercelStepWithoutData>>;
  };

  events: {
    create(
      runId: string | null,
      data: RunCreatedEventRequest | CreateEventRequest,
      params?: CreateEventParams
    ): Promise<EventResult>;

    list(params: ListEventsParams): Promise<PaginatedResponse<VercelEvent>>;
    listByCorrelationId(
      params: ListEventsByCorrelationIdParams
    ): Promise<PaginatedResponse<VercelEvent>>;
  };

  hooks: {
    get(hookId: string, params?: GetHookParams): Promise<VercelHook>;
    getByToken(token: string, params?: GetHookParams): Promise<VercelHook>;
    list(params: ListHooksParams): Promise<PaginatedResponse<VercelHook>>;
  };
}

// ============================================================================
// World Interface (Vercel @workflow/world compatible)
// ============================================================================

export interface VercelWorld extends VercelStorage, VercelStreamer {
  start?(): Promise<void>;
}
