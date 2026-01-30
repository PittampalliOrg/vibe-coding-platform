/**
 * Dapr World Provider for Workflow Web
 *
 * This module provides the Vercel-compatible World interface
 * backed by our Dapr state store.
 */

import type { VercelWorldAdapter } from '@workflow-worlds/dapr/web-adapter';

// Use globalThis to ensure the instance is shared across module boundaries
const globalForDapr = globalThis as unknown as {
  workflowWorld: VercelWorldAdapter | null;
  workflowWorldPromise: Promise<VercelWorldAdapter> | null;
};

// Store the raw DaprWorld for advanced operations
const globalForRawDapr = globalThis as unknown as {
  rawDaprWorld: Awaited<ReturnType<typeof import('@workflow-worlds/dapr').createDaprWorld>> | null;
};

/**
 * Get the global Workflow World instance
 *
 * Returns null if not yet initialized
 */
export function getWorkflowWorld(): VercelWorldAdapter | null {
  return globalForDapr.workflowWorld ?? null;
}

/**
 * Initialize the Workflow World
 *
 * Creates a DaprWorld and wraps it with the Vercel-compatible adapter.
 * This should be called during server startup (e.g., in instrumentation.ts)
 */
export async function initializeWorkflowWorld(): Promise<void> {
  // Prevent duplicate initialization
  if (globalForDapr.workflowWorld) {
    return;
  }

  // Prevent concurrent initialization
  if (globalForDapr.workflowWorldPromise) {
    await globalForDapr.workflowWorldPromise;
    return;
  }

  const initPromise = (async () => {
    try {
      const { createDaprWorld } = await import('@workflow-worlds/dapr');
      const { createVercelWorldAdapter } = await import('@workflow-worlds/dapr/web-adapter');

      console.log('[WorkflowWorld] Creating Dapr World instance...');

      const daprWorld = createDaprWorld({
        stateStoreName: process.env.DAPR_STATE_STORE ?? 'workflow-statestore',
        pubsubName: process.env.DAPR_PUBSUB ?? 'workflow-pubsub',
        deploymentId: process.env.HOSTNAME ?? 'workflow-web',
      });

      // Store raw DaprWorld for advanced operations
      globalForRawDapr.rawDaprWorld = daprWorld;

      // Start Dapr World in background (non-blocking)
      daprWorld.start().then(() => {
        console.log('[WorkflowWorld] Dapr World started successfully');
      }).catch((error) => {
        console.error('[WorkflowWorld] Dapr World start failed:', error);
      });

      // Create the Vercel-compatible adapter
      const adapter = createVercelWorldAdapter(daprWorld);
      globalForDapr.workflowWorld = adapter;

      console.log('[WorkflowWorld] Vercel World adapter initialized');

      // Setup graceful shutdown
      setupGracefulShutdown(daprWorld);

      return adapter;
    } catch (error) {
      console.error('[WorkflowWorld] Failed to initialize:', error);
      throw error;
    }
  })();

  globalForDapr.workflowWorldPromise = initPromise;
  await initPromise;
}

/**
 * Get or initialize the Workflow World
 *
 * This is a convenience function for API routes that need the world instance.
 */
export async function getOrInitializeWorld(): Promise<VercelWorldAdapter> {
  if (!globalForDapr.workflowWorld) {
    await initializeWorkflowWorld();
  }

  const world = globalForDapr.workflowWorld;
  if (!world) {
    throw new Error('Workflow World not available');
  }

  return world;
}

/**
 * Get the raw DaprWorld instance for advanced operations like creating steps
 *
 * This is needed because the VercelWorldAdapter doesn't expose step creation
 */
export async function getRawDaprWorld() {
  // If rawDaprWorld isn't set but world is initialized, we need to create it
  if (!globalForRawDapr.rawDaprWorld) {
    const { createDaprWorld } = await import('@workflow-worlds/dapr');

    console.log('[WorkflowWorld] Creating raw Dapr World for step operations...');

    const daprWorld = createDaprWorld({
      stateStoreName: process.env.DAPR_STATE_STORE ?? 'workflow-statestore',
      pubsubName: process.env.DAPR_PUBSUB ?? 'workflow-pubsub',
      deploymentId: process.env.HOSTNAME ?? 'workflow-web',
    });

    // Start it
    await daprWorld.start();

    globalForRawDapr.rawDaprWorld = daprWorld;
    console.log('[WorkflowWorld] Raw Dapr World ready');
  }

  return globalForRawDapr.rawDaprWorld;
}

/**
 * Setup graceful shutdown handlers
 */
function setupGracefulShutdown(daprWorld: { stop: () => Promise<void> }): void {
  const shutdown = async (signal: string) => {
    console.log(`[WorkflowWorld] Received ${signal}, shutting down...`);

    try {
      await daprWorld.stop();
      console.log('[WorkflowWorld] Dapr World stopped successfully');
    } catch (error) {
      console.error('[WorkflowWorld] Error stopping Dapr World:', error);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
