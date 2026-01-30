/**
 * Seed Workflows API Endpoint
 *
 * Creates multiple sample workflow runs with varied patterns for testing.
 * Based on Vercel Workflow DevKit examples.
 */

import { NextResponse } from 'next/server';
import { getOrInitializeWorld, getRawDaprWorld } from '@/lib/dapr-world';

// Workflow templates based on Vercel workflow-examples
const workflowTemplates = [
  // Mirrors Vercel's controlFlow from kitchen-sink/2-control-flows.ts
  // Shows Promise.race, Promise.all, parallel execution patterns
  {
    name: 'controlFlow',
    steps: [
      // Promise.race - these two steps start together, first one wins
      { name: 'delayedMessage', duration: 500, delay: 0 },
      { name: 'delayedMessage', duration: 2000, delay: 0 },
      // Promise.all - parallel execution after race completes
      { name: 'delayedMessage', duration: 300, delay: 500 },
      { name: 'delayedMessage', duration: 400, delay: 500 },
      { name: 'add', duration: 50, delay: 500 },
      // Background + foreground pattern
      { name: 'delayedMessage', duration: 800, delay: 900 },
      { name: 'delayedMessage', duration: 200, delay: 900 },
      { name: 'delayedMessage', duration: 300, delay: 900 },
      // Final step after background completes
      { name: 'delayedMessage', duration: 100, delay: 1700 },
      // Error handling step (caught)
      { name: 'failingStep', duration: 50, delay: 1800 },
    ],
  },
  // Mirrors Vercel's handleUserSignup from nextjs/workflows/user-signup.ts
  // Shows sequential steps with sleep
  {
    name: 'handleUserSignup',
    steps: [
      { name: 'createUser', duration: 200, delay: 0 },
      { name: 'sendWelcomeEmail', duration: 300, delay: 200 },
      { name: 'sleep', duration: 5000, delay: 500 },
      { name: 'sendOnboardingEmail', duration: 400, delay: 5500 },
    ],
  },
  {
    name: 'processPayment',
    steps: [
      { name: 'validateCard', duration: 200, delay: 0 },
      { name: 'checkFraud', duration: 500, delay: 200 },
      { name: 'authorizePayment', duration: 1500, delay: 700 },
      { name: 'capturePayment', duration: 800, delay: 2200 },
      { name: 'sendReceipt', duration: 400, delay: 3000 },
      { name: 'updateLedger', duration: 300, delay: 3400 },
    ],
  },
  {
    name: 'generateBirthdayCard',
    steps: [
      { name: 'fetchUserPreferences', duration: 100, delay: 0 },
      { name: 'generateImagePrompt', duration: 300, delay: 100 },
      { name: 'callImageGenAI', duration: 5000, delay: 400 },
      { name: 'applyTextOverlay', duration: 800, delay: 5400 },
      { name: 'saveToStorage', duration: 200, delay: 6200 },
      { name: 'sendNotification', duration: 150, delay: 6400 },
    ],
  },
  {
    name: 'flightBooking',
    steps: [
      { name: 'searchFlights', duration: 2000, delay: 0 },
      { name: 'checkAvailability', duration: 500, delay: 2000 },
      { name: 'reserveSeats', duration: 800, delay: 2500 },
      { name: 'processPayment', duration: 1500, delay: 3300 },
      { name: 'generateTicket', duration: 600, delay: 4800 },
      { name: 'sendConfirmation', duration: 300, delay: 5400 },
    ],
  },
  {
    name: 'processVideo',
    steps: [
      { name: 'downloadSource', duration: 3000, delay: 0 },
      { name: 'extractAudio', duration: 1500, delay: 3000 },
      { name: 'transcodeVideo', duration: 8000, delay: 4500 },
      { name: 'generateThumbnails', duration: 2000, delay: 4500 },
      { name: 'uploadTocdn', duration: 1000, delay: 12500 },
      { name: 'updateMetadata', duration: 200, delay: 13500 },
    ],
  },
  {
    name: 'ragAgentQuery',
    steps: [
      { name: 'parseQuery', duration: 100, delay: 0 },
      { name: 'generateEmbedding', duration: 400, delay: 100 },
      { name: 'searchVectorDB', duration: 600, delay: 500 },
      { name: 'retrieveDocuments', duration: 300, delay: 1100 },
      { name: 'generateResponse', duration: 2000, delay: 1400 },
      { name: 'cacheResult', duration: 100, delay: 3400 },
    ],
  },
  {
    name: 'orderFulfillment',
    steps: [
      { name: 'validateOrder', duration: 150, delay: 0 },
      { name: 'checkInventory', duration: 400, delay: 150 },
      { name: 'reserveStock', duration: 300, delay: 550 },
      { name: 'calculateShipping', duration: 500, delay: 850 },
      { name: 'createShipment', duration: 600, delay: 1350 },
      { name: 'printLabel', duration: 200, delay: 1950 },
      { name: 'notifyWarehouse', duration: 150, delay: 2150 },
    ],
  },
  {
    name: 'dataIngestion',
    steps: [
      { name: 'fetchSourceData', duration: 1500, delay: 0 },
      { name: 'validateSchema', duration: 300, delay: 1500 },
      { name: 'transformRecords', duration: 2000, delay: 1800 },
      { name: 'deduplicateData', duration: 800, delay: 3800 },
      { name: 'loadToWarehouse', duration: 1200, delay: 4600 },
      { name: 'updateCatalog', duration: 200, delay: 5800 },
    ],
  },
];

// Status options for variety
const statusOptions: Array<{ status: 'completed' | 'failed' | 'running' | 'pending'; weight: number }> = [
  { status: 'completed', weight: 60 },
  { status: 'failed', weight: 15 },
  { status: 'running', weight: 15 },
  { status: 'pending', weight: 10 },
];

function getRandomStatus() {
  const rand = Math.random() * 100;
  let cumulative = 0;
  for (const option of statusOptions) {
    cumulative += option.weight;
    if (rand < cumulative) return option.status;
  }
  return 'completed';
}

export async function POST(request: Request) {
  try {
    const world = await getOrInitializeWorld();
    const daprWorld = await getRawDaprWorld();

    if (!daprWorld) {
      return NextResponse.json(
        { success: false, error: 'DaprWorld not available' },
        { status: 503 }
      );
    }

    const { count = 10 } = await request.json().catch(() => ({ count: 10 }));
    const createdRuns: string[] = [];

    for (let i = 0; i < count; i++) {
      const template = workflowTemplates[i % workflowTemplates.length];
      const status = getRandomStatus();

      // Vary the timing for realism
      const baseTime = Date.now() - Math.random() * 3600000; // Random time within last hour
      const now = new Date(baseTime);

      // Create the run
      const runCreatedResult = await world.events.create(null, {
        eventType: 'run_created',
        workflowName: template.name,
        deploymentId: 'workflow-web',
        input: { seed: i, timestamp: baseTime },
      });

      const runId = runCreatedResult.run?.runId;
      if (!runId) continue;

      createdRuns.push(runId);

      // Start the run
      await world.events.create(runId, { eventType: 'run_started' });

      // Determine how many steps to create based on status
      let stepsToCreate = template.steps.length;
      let failAtStep = -1;

      if (status === 'failed') {
        failAtStep = Math.floor(Math.random() * template.steps.length);
        stepsToCreate = failAtStep + 1;
      } else if (status === 'running') {
        stepsToCreate = Math.floor(Math.random() * (template.steps.length - 1)) + 1;
      } else if (status === 'pending') {
        stepsToCreate = 0;
      }

      // Create steps
      for (let j = 0; j < stepsToCreate; j++) {
        const step = template.steps[j];
        const stepId = `step-${j + 1}-${step.name}`;
        const stepStartTime = new Date(baseTime + step.delay);
        const stepEndTime = new Date(stepStartTime.getTime() + step.duration);

        const stepStatus = j === failAtStep ? 'failed' :
                          (j === stepsToCreate - 1 && status === 'running') ? 'running' : 'completed';

        await daprWorld.storage.createStep({
          id: stepId,
          runId: runId,
          stepName: step.name,
          status: stepStatus,
          input: { stepIndex: j },
          output: stepStatus === 'completed' ? { success: true, duration: step.duration } : undefined,
          error: stepStatus === 'failed' ? { message: 'Step execution failed', code: 'STEP_ERROR' } : undefined,
          attempts: 1,
          createdAt: stepStartTime.toISOString(),
          updatedAt: stepEndTime.toISOString(),
          startedAt: stepStartTime.toISOString(),
          completedAt: stepStatus !== 'running' ? stepEndTime.toISOString() : undefined,
        });
      }

      // Calculate total duration and update run status
      const totalDuration = stepsToCreate > 0
        ? template.steps[stepsToCreate - 1].delay + template.steps[stepsToCreate - 1].duration
        : 0;
      const completedAt = new Date(baseTime + totalDuration);

      // Complete/fail the run based on status
      if (status === 'completed') {
        await world.events.create(runId, {
          eventType: 'run_completed',
          output: { success: true, stepsExecuted: stepsToCreate },
        });
        await daprWorld.storage.updateRun(runId, {
          startedAt: now.toISOString(),
          completedAt: completedAt.toISOString(),
        });
      } else if (status === 'failed') {
        await world.events.create(runId, {
          eventType: 'run_failed',
          error: { message: 'Workflow execution failed', code: 'WORKFLOW_ERROR' },
        });
        await daprWorld.storage.updateRun(runId, {
          startedAt: now.toISOString(),
          completedAt: completedAt.toISOString(),
        });
      } else if (status === 'running') {
        await daprWorld.storage.updateRun(runId, {
          startedAt: now.toISOString(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Created ${createdRuns.length} workflow runs`,
      runIds: createdRuns,
      workflows: [...new Set(createdRuns.map((_, i) => workflowTemplates[i % workflowTemplates.length].name))],
    });
  } catch (error) {
    console.error('[Seed Workflows] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'POST to this endpoint to seed workflow data',
    example: 'curl -X POST https://workflow.cnoe.localtest.me:8443/api/seed-workflows -H "Content-Type: application/json" -d \'{"count": 20}\'',
    workflows: workflowTemplates.map(t => ({ name: t.name, steps: t.steps.length })),
  });
}
