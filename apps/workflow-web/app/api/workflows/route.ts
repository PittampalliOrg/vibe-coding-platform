/**
 * Workflow Definitions API
 *
 * Lists all unique workflow names discovered from runs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOrInitializeWorld } from '@/lib/dapr-world';

export async function GET(request: NextRequest) {
  try {
    const world = await getOrInitializeWorld();
    const searchParams = request.nextUrl.searchParams;
    const includeStats = searchParams.get('includeStats') === 'true';

    // Get all runs to extract unique workflow names
    const result = await world.runs.list({
      pagination: { limit: 1000 }, // Get a large sample
      resolveData: 'none',
    });

    // Extract unique workflow names
    const workflowMap = new Map<string, { runCount: number; lastRun?: { runId: string; status: string; createdAt: string } }>();

    for (const run of result.data) {
      const createdAtStr = run.createdAt instanceof Date ? run.createdAt.toISOString() : String(run.createdAt);
      const existing = workflowMap.get(run.workflowName);
      if (existing) {
        existing.runCount++;
        // Update lastRun if this run is more recent
        if (!existing.lastRun || new Date(createdAtStr) > new Date(existing.lastRun.createdAt)) {
          existing.lastRun = {
            runId: run.runId,
            status: run.status,
            createdAt: createdAtStr,
          };
        }
      } else {
        workflowMap.set(run.workflowName, {
          runCount: 1,
          lastRun: {
            runId: run.runId,
            status: run.status,
            createdAt: createdAtStr,
          },
        });
      }
    }

    const workflows = Array.from(workflowMap.keys()).sort();

    if (includeStats) {
      const stats: Record<string, { runCount: number; lastRun?: { runId: string; status: string; createdAt: string } }> = {};
      for (const [name, data] of workflowMap) {
        stats[name] = data;
      }
      return NextResponse.json({ workflows, stats });
    }

    return NextResponse.json({ workflows });
  } catch (error) {
    console.error('[API] Failed to list workflows:', error);
    return NextResponse.json(
      {
        error: 'Failed to list workflows',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
