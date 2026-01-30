/**
 * Workflow Run Details API
 *
 * Gets details for a specific workflow run including steps and events.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOrInitializeWorld } from '@/lib/dapr-world';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const world = await getOrInitializeWorld();

    // Get the run with full data
    const run = await world.runs.get(runId, { resolveData: 'all' });

    // Get steps for this run
    const stepsResult = await world.steps.list({
      runId,
      resolveData: 'all',
    });

    // Get events for this run
    const eventsResult = await world.events.list({
      runId,
      pagination: { limit: 100 },
    });

    return NextResponse.json({
      run,
      steps: stepsResult.data,
      events: eventsResult.data,
    });
  } catch (error) {
    console.error('[API] Failed to get run:', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'Workflow run not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to get workflow run',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
