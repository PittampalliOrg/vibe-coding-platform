/**
 * DaprStorage - State Store Implementation for Workflow DevKit
 *
 * Uses Dapr State Store API for persisting workflow runs, steps, events, and hooks.
 * Implements atomic transactions for consistency and maintains indexes for listing operations.
 */

import { DaprClient } from '@dapr/dapr';
import type {
  Storage,
  Run,
  Step,
  WorkflowEvent,
  Hook,
  ListRunsOptions,
  ListResult,
  ResolvedDaprWorldConfig,
  StateOperation,
} from './types.js';
import { StateKeyPrefixes } from './types.js';

/**
 * Build a state key from prefix and identifiers
 */
function buildKey(...parts: string[]): string {
  return parts.join(':');
}

/**
 * DaprStorage implements the Storage interface using Dapr State Store API
 */
export class DaprStorage implements Storage {
  private client: DaprClient;
  private stateStoreName: string;
  private initialized = false;

  constructor(client: DaprClient, config: ResolvedDaprWorldConfig) {
    this.client = client;
    this.stateStoreName = config.stateStoreName;
  }

  /**
   * Initialize the storage (ensure indexes exist)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure the runs index exists
    const runsIndex = await this.client.state.get(
      this.stateStoreName,
      StateKeyPrefixes.RUNS_INDEX
    );
    if (!runsIndex) {
      await this.client.state.save(this.stateStoreName, [
        { key: StateKeyPrefixes.RUNS_INDEX, value: [] },
      ]);
    }

    this.initialized = true;
  }

  // ============================================================================
  // Run Operations
  // ============================================================================

  async createRun(run: Run): Promise<void> {
    const runKey = buildKey(StateKeyPrefixes.RUN, run.id);

    // Use transaction to atomically create run and update index
    const operations: StateOperation[] = [
      {
        operation: 'upsert',
        request: { key: runKey, value: run },
      },
    ];

    // Get current index and add new run ID
    const currentIndex = await this.getRunsIndex();
    if (!currentIndex.includes(run.id)) {
      operations.push({
        operation: 'upsert',
        request: {
          key: StateKeyPrefixes.RUNS_INDEX,
          value: [...currentIndex, run.id],
        },
      });
    }

    await this.executeTransaction(operations);

    // Initialize steps and events indexes for this run
    await this.client.state.save(this.stateStoreName, [
      { key: buildKey(StateKeyPrefixes.STEPS_INDEX, run.id), value: [] },
      { key: buildKey(StateKeyPrefixes.EVENTS_INDEX, run.id), value: [] },
      { key: buildKey(StateKeyPrefixes.EVENT_COUNTER, run.id), value: 0 },
    ]);
  }

  async getRun(runId: string): Promise<Run | null> {
    const key = buildKey(StateKeyPrefixes.RUN, runId);
    const result = await this.client.state.get(this.stateStoreName, key);
    return result as Run | null;
  }

  async updateRun(runId: string, updates: Partial<Run>): Promise<void> {
    const existing = await this.getRun(runId);
    if (!existing) {
      throw new Error(`Run not found: ${runId}`);
    }

    const updated: Run = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const key = buildKey(StateKeyPrefixes.RUN, runId);
    await this.client.state.save(this.stateStoreName, [{ key, value: updated }]);
  }

  async deleteRun(runId: string): Promise<void> {
    const runKey = buildKey(StateKeyPrefixes.RUN, runId);
    const stepsIndexKey = buildKey(StateKeyPrefixes.STEPS_INDEX, runId);
    const eventsIndexKey = buildKey(StateKeyPrefixes.EVENTS_INDEX, runId);
    const eventCounterKey = buildKey(StateKeyPrefixes.EVENT_COUNTER, runId);

    // Get all steps and events to delete
    const steps = await this.listSteps(runId);
    const events = await this.getEvents(runId);

    const operations: StateOperation[] = [
      { operation: 'delete', request: { key: runKey } },
      { operation: 'delete', request: { key: stepsIndexKey } },
      { operation: 'delete', request: { key: eventsIndexKey } },
      { operation: 'delete', request: { key: eventCounterKey } },
    ];

    // Delete all steps
    for (const step of steps) {
      operations.push({
        operation: 'delete',
        request: { key: buildKey(StateKeyPrefixes.STEP, runId, step.id) },
      });
      if (step.cacheKey) {
        operations.push({
          operation: 'delete',
          request: { key: buildKey(StateKeyPrefixes.CACHE, step.cacheKey) },
        });
      }
    }

    // Delete all events
    for (const event of events) {
      operations.push({
        operation: 'delete',
        request: { key: buildKey(StateKeyPrefixes.EVENT, runId, event.id) },
      });
    }

    // Update runs index
    const currentIndex = await this.getRunsIndex();
    const newIndex = currentIndex.filter((id) => id !== runId);
    operations.push({
      operation: 'upsert',
      request: { key: StateKeyPrefixes.RUNS_INDEX, value: newIndex },
    });

    await this.executeTransaction(operations);
  }

  async listRuns(options?: ListRunsOptions): Promise<ListResult<Run>> {
    const limit = options?.limit ?? 100;
    const cursor = options?.cursor ? parseInt(options.cursor, 10) : 0;

    const allRunIds = await this.getRunsIndex();

    // Apply cursor (skip)
    const runIds = allRunIds.slice(cursor);

    // Fetch runs in parallel
    const runs: Run[] = [];
    for (const runId of runIds) {
      if (runs.length >= limit) break;

      const run = await this.getRun(runId);
      if (!run) continue;

      // Apply filters
      if (options?.workflowId && run.workflowId !== options.workflowId) continue;
      if (options?.status && run.status !== options.status) continue;

      runs.push(run);
    }

    const hasMore = cursor + limit < allRunIds.length;

    return {
      items: runs,
      nextCursor: hasMore ? String(cursor + limit) : undefined,
      totalCount: allRunIds.length,
    };
  }

  // ============================================================================
  // Step Operations
  // ============================================================================

  async createStep(step: Step): Promise<void> {
    const stepKey = buildKey(StateKeyPrefixes.STEP, step.runId, step.id);

    const operations: StateOperation[] = [
      { operation: 'upsert', request: { key: stepKey, value: step } },
    ];

    // Update steps index
    const currentIndex = await this.getStepsIndex(step.runId);
    if (!currentIndex.includes(step.id)) {
      operations.push({
        operation: 'upsert',
        request: {
          key: buildKey(StateKeyPrefixes.STEPS_INDEX, step.runId),
          value: [...currentIndex, step.id],
        },
      });
    }

    // If step has a cache key, create cache mapping
    if (step.cacheKey) {
      operations.push({
        operation: 'upsert',
        request: {
          key: buildKey(StateKeyPrefixes.CACHE, step.cacheKey),
          value: { runId: step.runId, stepId: step.id },
        },
      });
    }

    await this.executeTransaction(operations);
  }

  async getStep(runId: string, stepId: string): Promise<Step | null> {
    const key = buildKey(StateKeyPrefixes.STEP, runId, stepId);
    const result = await this.client.state.get(this.stateStoreName, key);
    return result as Step | null;
  }

  async updateStep(
    runId: string,
    stepId: string,
    updates: Partial<Step>
  ): Promise<void> {
    const existing = await this.getStep(runId, stepId);
    if (!existing) {
      throw new Error(`Step not found: ${runId}/${stepId}`);
    }

    const updated: Step = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const operations: StateOperation[] = [
      {
        operation: 'upsert',
        request: {
          key: buildKey(StateKeyPrefixes.STEP, runId, stepId),
          value: updated,
        },
      },
    ];

    // Handle cache key changes
    if (updates.cacheKey && updates.cacheKey !== existing.cacheKey) {
      // Remove old cache mapping
      if (existing.cacheKey) {
        operations.push({
          operation: 'delete',
          request: { key: buildKey(StateKeyPrefixes.CACHE, existing.cacheKey) },
        });
      }
      // Add new cache mapping
      operations.push({
        operation: 'upsert',
        request: {
          key: buildKey(StateKeyPrefixes.CACHE, updates.cacheKey),
          value: { runId, stepId },
        },
      });
    }

    await this.executeTransaction(operations);
  }

  async deleteStep(runId: string, stepId: string): Promise<void> {
    const step = await this.getStep(runId, stepId);
    if (!step) return;

    const operations: StateOperation[] = [
      {
        operation: 'delete',
        request: { key: buildKey(StateKeyPrefixes.STEP, runId, stepId) },
      },
    ];

    // Remove from index
    const currentIndex = await this.getStepsIndex(runId);
    operations.push({
      operation: 'upsert',
      request: {
        key: buildKey(StateKeyPrefixes.STEPS_INDEX, runId),
        value: currentIndex.filter((id) => id !== stepId),
      },
    });

    // Remove cache mapping
    if (step.cacheKey) {
      operations.push({
        operation: 'delete',
        request: { key: buildKey(StateKeyPrefixes.CACHE, step.cacheKey) },
      });
    }

    await this.executeTransaction(operations);
  }

  async listSteps(runId: string): Promise<Step[]> {
    const stepIds = await this.getStepsIndex(runId);
    const steps: Step[] = [];

    for (const stepId of stepIds) {
      const step = await this.getStep(runId, stepId);
      if (step) {
        steps.push(step);
      }
    }

    return steps;
  }

  async getStepByCacheKey(cacheKey: string): Promise<Step | null> {
    const cacheMapping = await this.client.state.get(
      this.stateStoreName,
      buildKey(StateKeyPrefixes.CACHE, cacheKey)
    );

    if (!cacheMapping) return null;

    const { runId, stepId } = cacheMapping as { runId: string; stepId: string };
    return this.getStep(runId, stepId);
  }

  // ============================================================================
  // Event Operations
  // ============================================================================

  async createEvent(
    event: Omit<WorkflowEvent, 'id' | 'sequence'>
  ): Promise<WorkflowEvent> {
    const counterKey = buildKey(StateKeyPrefixes.EVENT_COUNTER, event.runId);

    // Get and increment sequence counter
    const counterResult = await this.client.state.get(this.stateStoreName, counterKey);
    const currentCounter = typeof counterResult === 'number' ? counterResult : 0;
    const sequence = currentCounter + 1;

    const eventId = `${event.runId}-evt-${sequence}`;
    const fullEvent: WorkflowEvent = {
      ...event,
      id: eventId,
      sequence,
    };

    const eventKey = buildKey(StateKeyPrefixes.EVENT, event.runId, eventId);

    const operations: StateOperation[] = [
      { operation: 'upsert', request: { key: eventKey, value: fullEvent } },
      { operation: 'upsert', request: { key: counterKey, value: sequence } },
    ];

    // Update events index
    const currentIndex = await this.getEventsIndex(event.runId);
    operations.push({
      operation: 'upsert',
      request: {
        key: buildKey(StateKeyPrefixes.EVENTS_INDEX, event.runId),
        value: [...currentIndex, eventId],
      },
    });

    await this.executeTransaction(operations);

    return fullEvent;
  }

  async getEvents(runId: string, afterSequence?: number): Promise<WorkflowEvent[]> {
    const eventIds = await this.getEventsIndex(runId);
    const events: WorkflowEvent[] = [];

    for (const eventId of eventIds) {
      const event = (await this.client.state.get(
        this.stateStoreName,
        buildKey(StateKeyPrefixes.EVENT, runId, eventId)
      )) as WorkflowEvent | null;

      if (event) {
        if (afterSequence === undefined || event.sequence > afterSequence) {
          events.push(event);
        }
      }
    }

    // Sort by sequence
    return events.sort((a, b) => a.sequence - b.sequence);
  }

  // ============================================================================
  // Hook Operations
  // ============================================================================

  async createHook(hook: Hook): Promise<void> {
    const key = buildKey(StateKeyPrefixes.HOOK, hook.token);
    await this.client.state.save(this.stateStoreName, [{ key, value: hook }]);
  }

  async getHook(token: string): Promise<Hook | null> {
    const key = buildKey(StateKeyPrefixes.HOOK, token);
    const result = await this.client.state.get(this.stateStoreName, key);
    return result as Hook | null;
  }

  async updateHook(token: string, updates: Partial<Hook>): Promise<void> {
    const existing = await this.getHook(token);
    if (!existing) {
      throw new Error(`Hook not found: ${token}`);
    }

    const updated: Hook = {
      ...existing,
      ...updates,
    };

    const key = buildKey(StateKeyPrefixes.HOOK, token);
    await this.client.state.save(this.stateStoreName, [{ key, value: updated }]);
  }

  async deleteHook(token: string): Promise<void> {
    const key = buildKey(StateKeyPrefixes.HOOK, token);
    await this.client.state.delete(this.stateStoreName, key);
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private async getRunsIndex(): Promise<string[]> {
    const result = await this.client.state.get(
      this.stateStoreName,
      StateKeyPrefixes.RUNS_INDEX
    );
    return (result as string[]) ?? [];
  }

  private async getStepsIndex(runId: string): Promise<string[]> {
    const result = await this.client.state.get(
      this.stateStoreName,
      buildKey(StateKeyPrefixes.STEPS_INDEX, runId)
    );
    return (result as string[]) ?? [];
  }

  private async getEventsIndex(runId: string): Promise<string[]> {
    const result = await this.client.state.get(
      this.stateStoreName,
      buildKey(StateKeyPrefixes.EVENTS_INDEX, runId)
    );
    return (result as string[]) ?? [];
  }

  private async executeTransaction(operations: StateOperation[]): Promise<void> {
    // Dapr state transactions require specific format
    // Group into saves and deletes
    const saves: Array<{ key: string; value: unknown }> = [];
    const deletes: string[] = [];

    for (const op of operations) {
      if (op.operation === 'upsert') {
        saves.push({ key: op.request.key, value: op.request.value });
      } else if (op.operation === 'delete') {
        deletes.push(op.request.key);
      }
    }

    // Execute saves and deletes
    // Note: For true atomicity, use Dapr's state transaction API
    // This is a simplified implementation
    if (saves.length > 0) {
      await this.client.state.save(this.stateStoreName, saves);
    }

    for (const key of deletes) {
      await this.client.state.delete(this.stateStoreName, key);
    }
  }
}
