/**
 * Next.js Instrumentation
 *
 * This file is loaded once when the Node.js runtime starts.
 * Used to initialize the Dapr World connection.
 */

export async function register() {
  // Only run on server-side (Node.js runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation] Starting server-side initialization...');

    // Check if Dapr is enabled
    const daprEnabled = process.env.DAPR_ENABLED === 'true';

    if (daprEnabled) {
      try {
        const { initializeWorkflowWorld } = await import('./lib/dapr-world');
        await initializeWorkflowWorld();
        console.log('[Instrumentation] Workflow World initialized');
      } catch (error) {
        console.error('[Instrumentation] Failed to initialize Workflow World:', error);
        // Don't throw - allow app to start, workflows will fail gracefully
      }
    } else {
      console.log('[Instrumentation] Dapr not enabled, skipping Workflow World initialization');
    }
  }
}
