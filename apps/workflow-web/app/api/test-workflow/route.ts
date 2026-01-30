/**
 * Test Workflow API Endpoint
 *
 * Creates a sample workflow run with multiple steps for testing the timeline visualization.
 */

import { NextResponse } from 'next/server';
import { getOrInitializeWorld, getRawDaprWorld } from '@/lib/dapr-world';

export async function POST() {
  try {
    const world = await getOrInitializeWorld();
    const daprWorld = await getRawDaprWorld();

    if (!daprWorld) {
      return NextResponse.json(
        { success: false, error: 'DaprWorld not available' },
        { status: 503 }
      );
    }

    const now = new Date();
    const baseTime = now.getTime();

    // Create the run using events API
    const runCreatedResult = await world.events.create(null, {
      eventType: 'run_created',
      workflowName: 'handleUserSignup',
      deploymentId: 'workflow-web',
      input: { userId: 'user-123', email: 'test@example.com' },
    });

    const runId = runCreatedResult.run?.runId;
    if (!runId) {
      throw new Error('Failed to create run');
    }

    // Start the run
    await world.events.create(runId, {
      eventType: 'run_started',
    });

    // Define step timings (simulating a real workflow)
    const stepTimings = [
      { name: 'validateInput', duration: 150, delay: 0 },
      { name: 'createUser', duration: 800, delay: 150 },
      { name: 'sendWelcomeEmail', duration: 1200, delay: 950 },
      { name: 'notifyAnalytics', duration: 300, delay: 950 }, // Parallel with sendWelcomeEmail
      { name: 'updateDatabase', duration: 500, delay: 2150 },
    ];

    // Create actual steps in the storage
    for (let i = 0; i < stepTimings.length; i++) {
      const step = stepTimings[i];
      const stepId = `step-${i + 1}-${step.name}`;
      const stepStartTime = new Date(baseTime + step.delay);
      const stepEndTime = new Date(stepStartTime.getTime() + step.duration);
      const nowStr = new Date().toISOString();

      // Create step using DaprWorld storage directly
      await daprWorld.storage.createStep({
        id: stepId,
        runId: runId,
        stepName: step.name,
        status: 'completed',
        input: { stepIndex: i },
        output: { success: true, duration: step.duration },
        attempts: 1,
        createdAt: stepStartTime.toISOString(),
        updatedAt: stepEndTime.toISOString(),
        startedAt: stepStartTime.toISOString(),
        completedAt: stepEndTime.toISOString(),
      });

      // Also create events for the step
      await world.events.create(runId, {
        eventType: 'step_started',
        stepId,
        stepName: step.name,
        startedAt: stepStartTime.toISOString(),
      });

      await world.events.create(runId, {
        eventType: 'step_completed',
        stepId,
        stepName: step.name,
        completedAt: stepEndTime.toISOString(),
        output: { success: true },
      });
    }

    // Calculate total duration
    const totalDuration = Math.max(...stepTimings.map(s => s.delay + s.duration));
    const completedAt = new Date(baseTime + totalDuration);

    // Complete the run
    await world.events.create(runId, {
      eventType: 'run_completed',
      output: { success: true, stepsExecuted: stepTimings.length },
    });

    // Update run with proper timing
    await daprWorld.storage.updateRun(runId, {
      startedAt: now.toISOString(),
      completedAt: completedAt.toISOString(),
    });

    return NextResponse.json({
      success: true,
      runId: runId,
      message: 'Test workflow created with steps',
      totalDuration: `${totalDuration}ms`,
      steps: stepTimings.map(s => s.name),
      viewUrl: `/run/${runId}`,
    });
  } catch (error) {
    console.error('[Test Workflow] Error:', error);
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

export async function GET() {
  return NextResponse.json({
    message: 'POST to this endpoint to create a test workflow with steps',
    example: 'curl -X POST https://workflow.cnoe.localtest.me:8443/api/test-workflow',
  });
}
