/**
 * @workflow/web Adapter for DaprWorld
 *
 * This module provides a compatibility layer between our DaprWorld implementation
 * and Vercel's @workflow/world interface used by @workflow/web.
 *
 * Usage:
 * ```typescript
 * import { createDaprWorld } from '@workflow-worlds/dapr';
 * import { createVercelWorldAdapter } from '@workflow-worlds/dapr/web-adapter';
 *
 * const daprWorld = createDaprWorld({ ... });
 * await daprWorld.start();
 *
 * // Create a Vercel-compatible world for @workflow/web
 * const vercelWorld = createVercelWorldAdapter(daprWorld);
 *
 * // Use with @workflow/web
 * // The vercelWorld implements the World interface expected by @workflow/web
 * ```
 */

import type { DaprWorld } from '../index.js';
import { createStorageAdapter } from './storage-adapter.js';
import { createStreamerAdapter } from './streamer-adapter.js';
import type { VercelWorld, VercelStorage, VercelStreamer } from './types.js';

// Re-export types
export type {
  VercelWorld,
  VercelStorage,
  VercelStreamer,
  VercelWorkflowRun,
  VercelWorkflowRunWithoutData,
  VercelStep,
  VercelStepWithoutData,
  VercelEvent,
  VercelHook,
  StructuredError,
  SerializedData,
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

export { createStorageAdapter } from './storage-adapter.js';
export { createStreamerAdapter, createEnhancedStreamerAdapter } from './streamer-adapter.js';

/**
 * Configuration for the Vercel World adapter
 */
export interface VercelWorldAdapterConfig {
  /**
   * Deployment ID to use in run metadata
   * Defaults to the DaprWorld's deploymentId
   */
  deploymentId?: string;
}

/**
 * Vercel World Adapter
 *
 * Wraps a DaprWorld to provide the interface expected by @workflow/web
 */
export class VercelWorldAdapter implements VercelWorld {
  private daprWorld: DaprWorld;
  private _storage: VercelStorage;
  private _streamer: VercelStreamer;
  private deploymentId: string;

  constructor(daprWorld: DaprWorld, config?: VercelWorldAdapterConfig) {
    this.daprWorld = daprWorld;
    this.deploymentId = config?.deploymentId ?? daprWorld.getConfig().deploymentId;

    // Create adapters
    this._storage = createStorageAdapter(daprWorld.storage, this.deploymentId);
    this._streamer = createStreamerAdapter(daprWorld.streamer);
  }

  // ============================================================================
  // Storage Interface (Vercel @workflow/world compatible)
  // ============================================================================

  get runs() {
    return this._storage.runs;
  }

  get steps() {
    return this._storage.steps;
  }

  get events() {
    return this._storage.events;
  }

  get hooks() {
    return this._storage.hooks;
  }

  // ============================================================================
  // Streamer Interface (Vercel @workflow/world compatible)
  // ============================================================================

  writeToStream(
    name: string,
    runId: string | Promise<string>,
    chunk: string | Uint8Array
  ): Promise<void> {
    return this._streamer.writeToStream(name, runId, chunk);
  }

  closeStream(name: string, runId: string | Promise<string>): Promise<void> {
    return this._streamer.closeStream(name, runId);
  }

  readFromStream(name: string, startIndex?: number): Promise<ReadableStream<Uint8Array>> {
    return this._streamer.readFromStream(name, startIndex);
  }

  listStreamsByRunId(runId: string): Promise<string[]> {
    return this._streamer.listStreamsByRunId(runId);
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  /**
   * Start the underlying DaprWorld if not already started
   */
  async start(): Promise<void> {
    if (!this.daprWorld.isReady()) {
      await this.daprWorld.start();
    }
  }

  /**
   * Check if the underlying DaprWorld is ready
   */
  isReady(): boolean {
    return this.daprWorld.isReady();
  }
}

/**
 * Create a Vercel-compatible World adapter from a DaprWorld
 *
 * @param daprWorld - The DaprWorld instance to wrap
 * @param config - Optional configuration
 * @returns A VercelWorld-compatible interface for @workflow/web
 *
 * @example
 * ```typescript
 * import { createDaprWorld } from '@workflow-worlds/dapr';
 * import { createVercelWorldAdapter } from '@workflow-worlds/dapr/web-adapter';
 *
 * const daprWorld = createDaprWorld();
 * await daprWorld.start();
 *
 * const vercelWorld = createVercelWorldAdapter(daprWorld);
 *
 * // Now you can use vercelWorld with @workflow/web
 * // Set the world in the environment or pass to the web UI
 * ```
 */
export function createVercelWorldAdapter(
  daprWorld: DaprWorld,
  config?: VercelWorldAdapterConfig
): VercelWorldAdapter {
  return new VercelWorldAdapter(daprWorld, config);
}

/**
 * Create a Vercel-compatible World from environment variables
 *
 * This is a convenience function that creates both the DaprWorld and
 * the Vercel adapter in one call.
 *
 * @returns A VercelWorld-compatible interface
 *
 * @example
 * ```typescript
 * import { createVercelWorldFromEnv } from '@workflow-worlds/dapr/web-adapter';
 *
 * const world = createVercelWorldFromEnv();
 * await world.start();
 *
 * // Use with @workflow/web
 * ```
 */
export async function createVercelWorldFromEnv(): Promise<VercelWorldAdapter> {
  // Dynamically import to avoid circular dependency
  const { createDaprWorldFromEnv } = await import('../index.js');
  const daprWorld = createDaprWorldFromEnv();
  return createVercelWorldAdapter(daprWorld);
}
