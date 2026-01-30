/**
 * Workflow Hooks API
 *
 * Lists all registered hooks from the Dapr state store.
 * Note: Hooks are a Vercel Workflow feature that may not be fully implemented in Dapr backend.
 */

import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Hooks are a Vercel-specific feature
    // For the Dapr backend, we return an empty list since hooks aren't implemented yet
    // This endpoint exists for UI compatibility with the Vercel dashboard
    return NextResponse.json({
      hooks: [],
      message: 'Hooks are not yet implemented in the Dapr backend',
    });
  } catch (error) {
    console.error('[API] Failed to list hooks:', error);
    return NextResponse.json(
      {
        error: 'Failed to list hooks',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
