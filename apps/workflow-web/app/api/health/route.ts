/**
 * Health Check Endpoint
 *
 * Used by Kubernetes probes and Dapr sidecar health checks.
 */

import { NextResponse } from 'next/server';
import { getWorkflowWorld } from '@/lib/dapr-world';

export async function GET() {
  const world = getWorkflowWorld();

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    dapr: {
      enabled: process.env.DAPR_ENABLED === 'true',
      ready: world?.isReady() ?? false,
      stateStore: process.env.DAPR_STATE_STORE ?? 'workflow-statestore',
    },
  });
}
