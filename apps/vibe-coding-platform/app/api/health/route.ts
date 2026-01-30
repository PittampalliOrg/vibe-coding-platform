/**
 * Health Check Endpoint
 *
 * Used by Kubernetes probes and Dapr sidecar health checks.
 * Returns 200 OK when the app is ready to handle requests.
 */

import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  })
}
