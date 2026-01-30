/**
 * Workflow Runs API
 *
 * Lists all workflow runs from the Dapr state store.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOrInitializeWorld } from '@/lib/dapr-world';

export async function GET(request: NextRequest) {
  try {
    const world = await getOrInitializeWorld();

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') ?? '20', 10);
    const cursor = searchParams.get('cursor') ?? undefined;
    const workflowName = searchParams.get('workflowName') ?? undefined;
    const status = searchParams.get('status') as 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | undefined;
    const sortOrder = searchParams.get('sortOrder') as 'asc' | 'desc' | undefined;

    const result = await world.runs.list({
      pagination: { limit, cursor },
      workflowName,
      status: status || undefined,
      resolveData: 'none', // Don't include input/output for listing
    });

    // Sort order is handled client-side since the Dapr backend doesn't support it natively
    let runs = result.data;
    if (sortOrder === 'asc') {
      runs = [...runs].reverse();
    }

    return NextResponse.json({
      runs,
      pagination: {
        hasMore: result.hasMore,
        cursor: result.cursor,
      },
    });
  } catch (error) {
    console.error('[API] Failed to list runs:', error);
    return NextResponse.json(
      {
        error: 'Failed to list workflow runs',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
