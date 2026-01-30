/**
 * Next.js Instrumentation
 *
 * This file is loaded once when the Next.js server starts.
 * It initializes the Dapr World for workflow execution when running in Kubernetes.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

/**
 * Register function called by Next.js on server startup
 */
export async function register() {
  // Only initialize Dapr in Node.js runtime (not Edge) and when enabled
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.DAPR_ENABLED === 'true') {
    // Dynamically import the Node.js-specific initialization
    const { initializeDapr } = await import('./lib/dapr-init');
    await initializeDapr();
  }
}
