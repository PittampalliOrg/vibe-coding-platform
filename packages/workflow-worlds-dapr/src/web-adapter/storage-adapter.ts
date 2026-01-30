/**
 * Storage Adapter for @workflow/web Compatibility
 *
 * Adapts our DaprStorage interface to the Vercel @workflow/world Storage interface.
 * This enables @workflow/web observability UI to connect to our Dapr-based workflow state.
 */

import type { DaprStorage } from '../storage.js';
import type { Run, Step, WorkflowEvent, Hook, WorkflowError } from '../types.js';
import type {
  VercelStorage,
  VercelWorkflowRun,
  VercelWorkflowRunWithoutData,
  VercelStep,
  VercelStepWithoutData,
  VercelEvent,
  VercelHook,
  StructuredError,
  PaginatedResponse,
  GetWorkflowRunParams,
  ListWorkflowRunsParams,
  GetStepParams,
  ListWorkflowRunStepsParams,
  ListEventsParams,
  ListEventsByCorrelationIdParams,
  GetHookParams,
  ListHooksParams,
  RunCreatedEventRequest,
  CreateEventRequest,
  CreateEventParams,
  EventResult,
} from './types.js';

// ============================================================================
// Type Conversion Utilities
// ============================================================================

/**
 * Convert ISO string to Date, handling undefined
 */
function toDate(isoString: string): Date;
function toDate(isoString: string | undefined): Date | undefined;
function toDate(isoString: string | undefined): Date | undefined {
  if (!isoString) return undefined;
  return new Date(isoString);
}

/**
 * Convert our WorkflowError to Vercel's StructuredError
 */
function toStructuredError(error: WorkflowError | undefined): StructuredError | undefined {
  if (!error) return undefined;
  return {
    message: error.message,
    stack: error.stack,
    code: error.code,
  };
}

/**
 * Convert our Run to Vercel's WorkflowRun
 */
function toVercelRun(run: Run, deploymentId: string): VercelWorkflowRun {
  return {
    runId: run.id,
    workflowName: run.workflowId, // Map workflowId to workflowName
    deploymentId,
    status: run.status,
    specVersion: 1, // Default spec version
    executionContext: run.metadata, // Map metadata to executionContext
    input: run.input,
    output: run.output,
    error: toStructuredError(run.error),
    createdAt: toDate(run.createdAt),
    updatedAt: toDate(run.updatedAt),
    startedAt: toDate(run.startedAt),
    completedAt: toDate(run.completedAt),
    expiredAt: undefined, // Not tracked in our model
  };
}

/**
 * Convert our Run to Vercel's WorkflowRunWithoutData
 */
function toVercelRunWithoutData(run: Run, deploymentId: string): VercelWorkflowRunWithoutData {
  return {
    runId: run.id,
    workflowName: run.workflowId,
    deploymentId,
    status: run.status,
    specVersion: 1,
    executionContext: run.metadata,
    input: undefined,
    output: undefined,
    error: toStructuredError(run.error),
    createdAt: toDate(run.createdAt),
    updatedAt: toDate(run.updatedAt),
    startedAt: toDate(run.startedAt),
    completedAt: toDate(run.completedAt),
    expiredAt: undefined,
  };
}

/**
 * Convert our Step to Vercel's Step
 */
function toVercelStep(step: Step): VercelStep {
  return {
    stepId: step.id,
    runId: step.runId,
    stepName: step.stepName,
    status: step.status,
    attempt: step.attempts,
    input: step.input,
    output: step.output,
    error: toStructuredError(step.error),
    startedAt: toDate(step.startedAt),
    completedAt: toDate(step.completedAt),
    createdAt: toDate(step.createdAt),
    updatedAt: toDate(step.updatedAt),
    retryAfter: undefined, // Not tracked in our model
    specVersion: 1,
  };
}

/**
 * Convert our Step to Vercel's StepWithoutData
 */
function toVercelStepWithoutData(step: Step): VercelStepWithoutData {
  return {
    stepId: step.id,
    runId: step.runId,
    stepName: step.stepName,
    status: step.status,
    attempt: step.attempts,
    input: undefined,
    output: undefined,
    error: toStructuredError(step.error),
    startedAt: toDate(step.startedAt),
    completedAt: toDate(step.completedAt),
    createdAt: toDate(step.createdAt),
    updatedAt: toDate(step.updatedAt),
    retryAfter: undefined,
    specVersion: 1,
  };
}

/**
 * Convert our WorkflowEvent to Vercel's Event
 */
function toVercelEvent(event: WorkflowEvent): VercelEvent {
  return {
    eventId: event.id,
    runId: event.runId,
    eventType: event.type,
    correlationId: undefined, // Not tracked in our model
    eventData: event.data,
    createdAt: toDate(event.timestamp),
    specVersion: 1,
  };
}

/**
 * Convert our Hook to Vercel's Hook
 */
function toVercelHook(hook: Hook): VercelHook {
  return {
    hookId: hook.token, // Use token as hookId
    runId: hook.runId,
    token: hook.token,
    ownerId: 'local', // Not tracked in our model
    projectId: 'local', // Not tracked in our model
    environment: 'production', // Not tracked in our model
    metadata: hook.payload,
    createdAt: toDate(hook.createdAt),
    specVersion: 1,
  };
}

// ============================================================================
// Storage Adapter Implementation
// ============================================================================

/**
 * Creates a Vercel-compatible Storage interface wrapping our DaprStorage
 */
export function createStorageAdapter(
  storage: DaprStorage,
  deploymentId: string
): VercelStorage {
  // Use type assertion since we implement the runtime behavior correctly
  // but TypeScript can't verify the overloaded signatures statically
  return {
    runs: createRunsAdapter(storage, deploymentId),
    steps: createStepsAdapter(storage),
    events: createEventsAdapter(storage, deploymentId),
    hooks: createHooksAdapter(storage),
  } as VercelStorage;
}

/**
 * Creates the runs sub-interface
 */
function createRunsAdapter(storage: DaprStorage, deploymentId: string) {
  return {
    async get(
      id: string,
      params?: GetWorkflowRunParams
    ): Promise<VercelWorkflowRun | VercelWorkflowRunWithoutData> {
      const run = await storage.getRun(id);
      if (!run) {
        throw new Error(`Run not found: ${id}`);
      }

      if (params?.resolveData === 'none') {
        return toVercelRunWithoutData(run, deploymentId);
      }
      return toVercelRun(run, deploymentId);
    },

    async list(
      params?: ListWorkflowRunsParams
    ): Promise<PaginatedResponse<VercelWorkflowRun | VercelWorkflowRunWithoutData>> {
      const result = await storage.listRuns({
        workflowId: params?.workflowName,
        status: params?.status,
        limit: params?.pagination?.limit ?? 20,
        cursor: params?.pagination?.cursor,
      });

      const data = result.items.map((run) =>
        params?.resolveData === 'none'
          ? toVercelRunWithoutData(run, deploymentId)
          : toVercelRun(run, deploymentId)
      );

      return {
        data,
        hasMore: !!result.nextCursor,
        cursor: result.nextCursor ?? null,
      };
    },
  };
}

/**
 * Creates the steps sub-interface
 */
function createStepsAdapter(storage: DaprStorage) {
  return {
    async get(
      runId: string | undefined,
      stepId: string,
      params?: GetStepParams
    ): Promise<VercelStep | VercelStepWithoutData> {
      if (!runId) {
        throw new Error('runId is required');
      }

      const step = await storage.getStep(runId, stepId);
      if (!step) {
        throw new Error(`Step not found: ${runId}/${stepId}`);
      }

      if (params?.resolveData === 'none') {
        return toVercelStepWithoutData(step);
      }
      return toVercelStep(step);
    },

    async list(
      params: ListWorkflowRunStepsParams
    ): Promise<PaginatedResponse<VercelStep | VercelStepWithoutData>> {
      const steps = await storage.listSteps(params.runId);

      // Apply pagination manually (our storage doesn't support it for steps)
      const limit = params.pagination?.limit ?? 20;
      const cursor = params.pagination?.cursor
        ? parseInt(params.pagination.cursor, 10)
        : 0;
      const paginatedSteps = steps.slice(cursor, cursor + limit);
      const hasMore = cursor + limit < steps.length;

      const data = paginatedSteps.map((step) =>
        params.resolveData === 'none'
          ? toVercelStepWithoutData(step)
          : toVercelStep(step)
      );

      return {
        data,
        hasMore,
        cursor: hasMore ? String(cursor + limit) : null,
      };
    },
  };
}

/**
 * Creates the events sub-interface
 */
function createEventsAdapter(storage: DaprStorage, deploymentId: string) {
  return {
    async create(
      runId: string | null,
      data: RunCreatedEventRequest | CreateEventRequest,
      params?: CreateEventParams
    ): Promise<EventResult> {
      const now = new Date().toISOString();

      if (runId === null && data.eventType === 'run_created') {
        // Create a new run
        const runData = data as RunCreatedEventRequest;
        const newRunId = `run-${Date.now()}`;

        const run: Run = {
          id: newRunId,
          workflowId: runData.workflowName,
          status: 'pending',
          input: runData.input,
          createdAt: now,
          updatedAt: now,
          metadata: runData.executionContext,
        };

        await storage.createRun(run);

        // Create the event
        const event = await storage.createEvent({
          runId: newRunId,
          type: 'run_created',
          data: runData,
          timestamp: now,
        });

        return {
          event: toVercelEvent(event),
          run: toVercelRun(run, deploymentId),
        };
      }

      if (runId === null) {
        throw new Error('runId is required for non-run_created events');
      }

      // Create event for existing run
      const event = await storage.createEvent({
        runId,
        type: data.eventType,
        data,
        timestamp: now,
      });

      // Handle state updates based on event type
      const eventResult: EventResult = {
        event: toVercelEvent(event),
      };

      switch (data.eventType) {
        case 'run_started': {
          await storage.updateRun(runId, { status: 'running', startedAt: now });
          const run = await storage.getRun(runId);
          if (run) eventResult.run = toVercelRun(run, deploymentId);
          break;
        }
        case 'run_completed': {
          const completedData = data as CreateEventRequest & { output?: unknown };
          await storage.updateRun(runId, {
            status: 'completed',
            output: completedData.output,
            completedAt: now,
          });
          const run = await storage.getRun(runId);
          if (run) eventResult.run = toVercelRun(run, deploymentId);
          break;
        }
        case 'run_failed': {
          const failedData = data as CreateEventRequest & { error?: StructuredError };
          await storage.updateRun(runId, {
            status: 'failed',
            error: failedData.error
              ? {
                  message: failedData.error.message,
                  code: failedData.error.code,
                  stack: failedData.error.stack,
                }
              : undefined,
            completedAt: now,
          });
          const run = await storage.getRun(runId);
          if (run) eventResult.run = toVercelRun(run, deploymentId);
          break;
        }
        case 'run_cancelled': {
          await storage.updateRun(runId, { status: 'cancelled', completedAt: now });
          const run = await storage.getRun(runId);
          if (run) eventResult.run = toVercelRun(run, deploymentId);
          break;
        }
        case 'step_started':
        case 'step_completed':
        case 'step_failed':
        case 'step_skipped': {
          // Step events would update step state
          // For now, just return the event
          break;
        }
        default: {
          // Unknown event type, just return the event
          break;
        }
      }

      return eventResult;
    },

    async list(params: ListEventsParams): Promise<PaginatedResponse<VercelEvent>> {
      const events = await storage.getEvents(params.runId);

      // Apply pagination
      const limit = params.pagination?.limit ?? 20;
      const cursor = params.pagination?.cursor
        ? parseInt(params.pagination.cursor, 10)
        : 0;
      const paginatedEvents = events.slice(cursor, cursor + limit);
      const hasMore = cursor + limit < events.length;

      return {
        data: paginatedEvents.map(toVercelEvent),
        hasMore,
        cursor: hasMore ? String(cursor + limit) : null,
      };
    },

    async listByCorrelationId(
      params: ListEventsByCorrelationIdParams
    ): Promise<PaginatedResponse<VercelEvent>> {
      // Our storage doesn't track correlationId, return empty
      // This could be enhanced by adding correlationId to our event model
      console.warn(
        `[StorageAdapter] listByCorrelationId not fully supported, correlationId: ${params.correlationId}`
      );
      return {
        data: [],
        hasMore: false,
        cursor: null,
      };
    },
  };
}

/**
 * Creates the hooks sub-interface
 */
function createHooksAdapter(storage: DaprStorage) {
  return {
    async get(hookId: string, _params?: GetHookParams): Promise<VercelHook> {
      // In our model, hookId is the token
      const hook = await storage.getHook(hookId);
      if (!hook) {
        throw new Error(`Hook not found: ${hookId}`);
      }
      return toVercelHook(hook);
    },

    async getByToken(token: string, _params?: GetHookParams): Promise<VercelHook> {
      const hook = await storage.getHook(token);
      if (!hook) {
        throw new Error(`Hook not found for token: ${token}`);
      }
      return toVercelHook(hook);
    },

    async list(params: ListHooksParams): Promise<PaginatedResponse<VercelHook>> {
      // Our storage doesn't have a listHooks by runId method
      // This would need to be added to DaprStorage for full compatibility
      console.warn(
        `[StorageAdapter] list hooks by runId not fully supported, runId: ${params.runId}`
      );
      return {
        data: [],
        hasMore: false,
        cursor: null,
      };
    },
  };
}
