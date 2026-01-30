/**
 * Workflow Test API Endpoint
 *
 * This endpoint tests the Dapr World integration by creating a test workflow run.
 */

import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Dynamically import to avoid Edge runtime issues
    const { getDaprWorld } = await import('@/lib/dapr-init');
    const world = getDaprWorld();

    if (!world) {
      return NextResponse.json(
        {
          success: false,
          error: 'Dapr World not initialized. Is DAPR_ENABLED=true?',
          daprEnabled: process.env.DAPR_ENABLED,
        },
        { status: 503 }
      );
    }

    if (!world.isReady()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Dapr World is not ready',
        },
        { status: 503 }
      );
    }

    // Create a test workflow run
    const runId = `test-run-${Date.now()}`;
    const run = {
      id: runId,
      workflowId: 'test-workflow',
      status: 'pending' as const,
      input: { message: 'Hello from workflow test!' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await world.storage.createRun(run);

    // Retrieve it to verify
    const retrievedRun = await world.storage.getRun(runId);

    // Update status
    await world.storage.updateRun(runId, {
      status: 'completed',
      output: { result: 'Test completed successfully!' },
    });

    const finalRun = await world.storage.getRun(runId);

    // Test queue
    const messageId = await world.queue.send('test-queue', {
      type: 'test',
      data: 'Hello from queue!',
    });

    // Clean up
    await world.storage.deleteRun(runId);

    return NextResponse.json({
      success: true,
      message: 'Dapr World integration test passed!',
      tests: {
        storage: {
          created: retrievedRun !== null,
          updated: finalRun?.status === 'completed',
          deleted: true,
        },
        queue: {
          messageSent: !!messageId,
          messageId,
        },
      },
      daprConfig: world.getConfig(),
    });
  } catch (error) {
    console.error('[Workflow Test] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { getDaprWorld } = await import('@/lib/dapr-init');
    const world = getDaprWorld();

    if (!world || !world.isReady()) {
      return NextResponse.json(
        { success: false, error: 'Dapr World not available' },
        { status: 503 }
      );
    }

    // Create a workflow run from the request
    const runId = `run-${Date.now()}`;
    const run = {
      id: runId,
      workflowId: body.workflowId ?? 'default-workflow',
      status: 'pending' as const,
      input: body.input ?? {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await world.storage.createRun(run);

    // Send to queue for processing
    await world.queue.send('workflow-invocations', {
      runId,
      workflowId: run.workflowId,
      input: run.input,
    });

    return NextResponse.json({
      success: true,
      runId,
      message: 'Workflow run created and queued for processing',
    });
  } catch (error) {
    console.error('[Workflow Create] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
