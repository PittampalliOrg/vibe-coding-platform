/**
 * Dapr World Initialization (Node.js only)
 *
 * This module initializes the Dapr World for workflow execution.
 * It should only be imported in Node.js runtime via dynamic import.
 */

import type { DaprWorld } from '@workflow-worlds/dapr';

// Use globalThis to ensure the instance is shared across module boundaries
// This is necessary because Next.js may create separate module instances
const globalForDapr = globalThis as unknown as {
  daprWorld: DaprWorld | null;
};

/**
 * Get the global Dapr World instance
 *
 * Returns null if Dapr is not enabled or not yet initialized
 */
export function getDaprWorld(): DaprWorld | null {
  return globalForDapr.daprWorld ?? null;
}

/**
 * Initialize Dapr World
 *
 * Unlike ai-chatbot which uses lazy Dapr initialization, vibe-coding-platform
 * creates a DaprWorld instance but does NOT block waiting for the sidecar.
 * The sidecar connection will be established when first needed.
 */
export async function initializeDapr(): Promise<void> {
  try {
    const { createDaprWorld } = await import('@workflow-worlds/dapr');

    console.log('[Dapr] Creating Dapr World instance (non-blocking)...');

    globalForDapr.daprWorld = createDaprWorld({
      stateStoreName: process.env.DAPR_STATE_STORE ?? 'workflow-statestore',
      pubsubName: process.env.DAPR_PUBSUB ?? 'workflow-pubsub',
      deploymentId: process.env.HOSTNAME ?? 'local',
      // Skip starting HTTP server since Next.js handles HTTP traffic
      skipServer: true,
    });

    // Start Dapr World in background - don't block app startup
    // With skipServer: true, this only initializes the client connection
    globalForDapr.daprWorld.start().then(() => {
      console.log('[Dapr] Dapr World started successfully (client-only mode)');
    }).catch((error) => {
      console.error('[Dapr] Dapr World start failed (will retry on first use):', error);
    });

    console.log('[Dapr] Dapr World initialization started (non-blocking)');

    // Handle graceful shutdown
    setupGracefulShutdown();
  } catch (error) {
    console.error('[Dapr] Failed to create Dapr World:', error);
    // Don't throw - allow the app to start without Dapr
    // Workflows will fail with meaningful errors if Dapr is unavailable
  }
}

/**
 * Setup graceful shutdown handlers
 */
function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    console.log(`[Dapr] Received ${signal}, shutting down Dapr World...`);

    if (globalForDapr.daprWorld) {
      try {
        await globalForDapr.daprWorld.stop();
        console.log('[Dapr] Dapr World stopped successfully');
      } catch (error) {
        console.error('[Dapr] Error stopping Dapr World:', error);
      }
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
