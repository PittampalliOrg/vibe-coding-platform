/**
 * @workflow-worlds/dapr
 *
 * Dapr World implementation for Vercel Workflow DevKit.
 * Enables Kubernetes-native, self-hosted durable workflow execution
 * using Dapr's building blocks (State Store, Pub/Sub).
 *
 * @example
 * ```typescript
 * import { createDaprWorld } from '@workflow-worlds/dapr';
 *
 * const world = createDaprWorld({
 *   stateStoreName: 'workflow-statestore',
 *   pubsubName: 'workflow-pubsub',
 *   deploymentId: process.env.HOSTNAME ?? 'local',
 * });
 *
 * await world.start();
 * ```
 */

import { DaprClient, DaprServer, CommunicationProtocolEnum } from '@dapr/dapr';
import { DaprStorage } from './storage.js';
import { DaprQueue } from './queue.js';
import { DaprStreamer } from './streamer.js';
import type {
  World,
  DaprWorldConfig,
  ResolvedDaprWorldConfig,
  Storage,
  Queue,
  Streamer,
} from './types.js';

// Re-export types for consumers
export type {
  World,
  DaprWorldConfig,
  ResolvedDaprWorldConfig,
  Storage,
  Queue,
  Streamer,
  Run,
  RunStatus,
  Step,
  StepStatus,
  WorkflowEvent,
  Hook,
  WorkflowError,
  ListRunsOptions,
  ListResult,
  QueueMessage,
  SendMessageOptions,
  MessageHandler,
  SubscribeOptions,
  Subscription,
  StreamChunk,
  StreamMetadata,
  CreateStreamOptions,
  StreamHandler,
  StreamSubscribeOptions,
  StreamSubscription,
  WritableStream,
} from './types.js';

export { StateKeyPrefixes, PubSubTopics } from './types.js';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: ResolvedDaprWorldConfig = {
  stateStoreName: 'workflow-statestore',
  pubsubName: 'workflow-pubsub',
  deploymentId: process.env.HOSTNAME ?? 'local',
  daprHost: process.env.DAPR_HOST ?? '127.0.0.1',
  daprHttpPort: parseInt(process.env.DAPR_HTTP_PORT ?? '3500', 10),
  daprGrpcPort: parseInt(process.env.DAPR_GRPC_PORT ?? '50001', 10),
  useGrpc: process.env.DAPR_USE_GRPC === 'true',
  connectionTimeout: 5000,
  maxRetries: 3,
  skipServer: process.env.DAPR_SKIP_SERVER === 'true',
};

/**
 * Resolve configuration with defaults
 */
function resolveConfig(config?: DaprWorldConfig): ResolvedDaprWorldConfig {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    daprHost: config?.daprHost ?? DEFAULT_CONFIG.daprHost,
    daprHttpPort: config?.daprHttpPort ?? DEFAULT_CONFIG.daprHttpPort,
    daprGrpcPort: config?.daprGrpcPort ?? DEFAULT_CONFIG.daprGrpcPort,
    skipServer: config?.skipServer ?? DEFAULT_CONFIG.skipServer,
  };
}

/**
 * DaprWorld - Complete World implementation using Dapr
 *
 * Provides:
 * - Storage: Workflow state persistence via Dapr State Store
 * - Queue: Message passing via Dapr Pub/Sub (NATS JetStream)
 * - Streamer: Real-time data streaming via Dapr Pub/Sub + State Store
 */
export class DaprWorld implements World {
  readonly storage: DaprStorage;
  readonly queue: DaprQueue;
  readonly streamer: DaprStreamer;

  private client: DaprClient;
  private server: DaprServer;
  private config: ResolvedDaprWorldConfig;
  private ready: boolean = false;
  private started: boolean = false;

  constructor(config?: DaprWorldConfig) {
    this.config = resolveConfig(config);

    // Initialize Dapr client
    const protocol = this.config.useGrpc
      ? CommunicationProtocolEnum.GRPC
      : CommunicationProtocolEnum.HTTP;

    this.client = new DaprClient({
      daprHost: this.config.daprHost,
      daprPort: this.config.useGrpc
        ? String(this.config.daprGrpcPort)
        : String(this.config.daprHttpPort),
      communicationProtocol: protocol,
    });

    // Initialize Dapr server for pub/sub subscriptions
    // The app port is typically set via DAPR_APP_PORT or defaults to 3000
    const appPort = process.env.DAPR_APP_PORT ?? '3000';
    this.server = new DaprServer({
      serverHost: '0.0.0.0',
      serverPort: appPort,
      clientOptions: {
        daprHost: this.config.daprHost,
        daprPort: this.config.useGrpc
          ? String(this.config.daprGrpcPort)
          : String(this.config.daprHttpPort),
        communicationProtocol: protocol,
      },
    });

    // Initialize components
    this.storage = new DaprStorage(this.client, this.config);
    this.queue = new DaprQueue(this.client, this.config);
    this.streamer = new DaprStreamer(this.client, this.config);
  }

  /**
   * Start the Dapr World
   *
   * Initializes connections and starts the Dapr server for pub/sub subscriptions
   */
  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    try {
      // Wait for Dapr sidecar to be ready
      await this.waitForSidecar();

      // Initialize storage
      await this.storage.initialize();

      if (this.config.skipServer) {
        // Client-only mode: skip server startup
        // Storage operations work, but pub/sub callbacks are disabled
        console.log(
          `[DaprWorld] Started in client-only mode (deployment: ${this.config.deploymentId})`
        );
      } else {
        // Full mode: start server for pub/sub callbacks
        // Initialize queue with server
        await this.queue.initialize(this.server);

        // Initialize streamer with server
        await this.streamer.initialize(this.server);

        // Start the Dapr server for receiving pub/sub messages
        await this.server.start();

        console.log(
          `[DaprWorld] Started successfully (deployment: ${this.config.deploymentId})`
        );
      }

      this.ready = true;
      this.started = true;
    } catch (error) {
      console.error('[DaprWorld] Failed to start:', error);
      throw error;
    }
  }

  /**
   * Stop the Dapr World
   *
   * Cleans up connections and stops the Dapr server
   */
  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    try {
      if (!this.config.skipServer) {
        // Full mode: shutdown server components
        await this.queue.shutdown();
        await this.streamer.shutdown();
        await this.server.stop();
      }
      // Client-only mode: nothing to stop (just client connections)

      this.ready = false;
      this.started = false;

      console.log('[DaprWorld] Stopped successfully');
    } catch (error) {
      console.error('[DaprWorld] Error during shutdown:', error);
      throw error;
    }
  }

  /**
   * Check if the World is ready to handle requests
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Get the resolved configuration
   */
  getConfig(): ResolvedDaprWorldConfig {
    return { ...this.config };
  }

  /**
   * Wait for the Dapr sidecar to be ready
   * Default timeout is 180 attempts (180 seconds / 3 minutes) for slow-starting sidecars
   * In dev environments, Dapr waits for the app healthcheck which can take 100+ seconds
   * Can be configured via DAPR_SIDECAR_WAIT_ATTEMPTS environment variable
   */
  private async waitForSidecar(): Promise<void> {
    const maxAttempts = parseInt(process.env.DAPR_SIDECAR_WAIT_ATTEMPTS ?? '180', 10);
    const delay = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Check sidecar health using the metadata endpoint
        const port = this.config.useGrpc
          ? this.config.daprGrpcPort
          : this.config.daprHttpPort;
        const healthUrl = `http://${this.config.daprHost}:${port}/v1.0/healthz`;

        const response = await fetch(healthUrl);
        if (response.ok) {
          console.log(`[DaprWorld] Sidecar ready (attempt ${attempt})`);
          return;
        }
      } catch {
        // Sidecar not ready yet
      }

      if (attempt < maxAttempts) {
        await delay(1000);
      }
    }

    throw new Error(
      `Dapr sidecar not ready after ${maxAttempts} attempts. ` +
        `Ensure Dapr is running at ${this.config.daprHost}:${this.config.daprHttpPort}`
    );
  }
}

/**
 * Create a new DaprWorld instance
 *
 * Factory function for creating DaprWorld with optional configuration
 *
 * @example
 * ```typescript
 * // With default configuration
 * const world = createDaprWorld();
 *
 * // With custom configuration
 * const world = createDaprWorld({
 *   stateStoreName: 'my-statestore',
 *   pubsubName: 'my-pubsub',
 *   deploymentId: 'my-deployment',
 * });
 *
 * // Start the world
 * await world.start();
 *
 * // Use storage, queue, and streamer
 * await world.storage.createRun({ ... });
 * await world.queue.send('my-queue', { ... });
 * const stream = await world.streamer.createStream('my-stream');
 * ```
 */
export function createDaprWorld(config?: DaprWorldConfig): DaprWorld {
  return new DaprWorld(config);
}

/**
 * Environment variable helper to check if Dapr is enabled
 */
export function isDaprEnabled(): boolean {
  return process.env.DAPR_ENABLED === 'true';
}

/**
 * Create DaprWorld from environment variables
 *
 * Reads configuration from:
 * - DAPR_STATE_STORE: State store component name
 * - DAPR_PUBSUB: Pub/sub component name
 * - DAPR_HOST: Dapr sidecar host
 * - DAPR_HTTP_PORT: Dapr HTTP port
 * - DAPR_GRPC_PORT: Dapr gRPC port
 * - DAPR_USE_GRPC: Whether to use gRPC
 * - HOSTNAME: Deployment ID
 */
export function createDaprWorldFromEnv(): DaprWorld {
  return createDaprWorld({
    stateStoreName: process.env.DAPR_STATE_STORE,
    pubsubName: process.env.DAPR_PUBSUB,
    deploymentId: process.env.HOSTNAME,
    daprHost: process.env.DAPR_HOST,
    daprHttpPort: process.env.DAPR_HTTP_PORT
      ? parseInt(process.env.DAPR_HTTP_PORT, 10)
      : undefined,
    daprGrpcPort: process.env.DAPR_GRPC_PORT
      ? parseInt(process.env.DAPR_GRPC_PORT, 10)
      : undefined,
    useGrpc: process.env.DAPR_USE_GRPC === 'true',
    skipServer: process.env.DAPR_SKIP_SERVER === 'true',
  });
}

// Default export
export default DaprWorld;
