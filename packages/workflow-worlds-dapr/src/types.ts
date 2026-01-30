/**
 * Dapr World Types for Vercel Workflow DevKit
 *
 * These interfaces define the contract between the Workflow DevKit
 * and the Dapr infrastructure layer.
 */

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration options for creating a DaprWorld instance
 */
export interface DaprWorldConfig {
  /** Name of the Dapr state store component (default: 'workflow-statestore') */
  stateStoreName?: string;
  /** Name of the Dapr pub/sub component (default: 'workflow-pubsub') */
  pubsubName?: string;
  /** Unique identifier for this deployment (default: hostname or 'local') */
  deploymentId?: string;
  /** Dapr sidecar host (default: '127.0.0.1') */
  daprHost?: string;
  /** Dapr HTTP port (default: 3500) */
  daprHttpPort?: number;
  /** Dapr gRPC port (default: 50001) */
  daprGrpcPort?: number;
  /** Whether to use gRPC instead of HTTP (default: false) */
  useGrpc?: boolean;
  /** Connection timeout in milliseconds (default: 5000) */
  connectionTimeout?: number;
  /** Maximum retry attempts for operations (default: 3) */
  maxRetries?: number;
  /**
   * Skip starting the HTTP server (default: false)
   *
   * When true, DaprWorld runs in client-only mode:
   * - Storage operations work via Dapr HTTP client
   * - Queue/Streamer subscriptions are disabled (no callbacks)
   *
   * Use this when integrating with an existing HTTP server (e.g., Next.js)
   * that handles Dapr callbacks via its own routes.
   */
  skipServer?: boolean;
}

/**
 * Resolved configuration with all defaults applied
 */
export interface ResolvedDaprWorldConfig {
  stateStoreName: string;
  pubsubName: string;
  deploymentId: string;
  daprHost: string;
  daprHttpPort: number;
  daprGrpcPort: number;
  useGrpc: boolean;
  connectionTimeout: number;
  maxRetries: number;
  skipServer: boolean;
}

// ============================================================================
// Storage Types (Workflow DevKit Interface)
// ============================================================================

/**
 * Workflow run status
 */
export type RunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Workflow step status
 */
export type StepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

/**
 * Represents a workflow run instance
 */
export interface Run {
  /** Unique identifier for the run */
  id: string;
  /** Workflow definition identifier */
  workflowId: string;
  /** Current status of the run */
  status: RunStatus;
  /** Input data for the workflow */
  input: unknown;
  /** Output data from the workflow (when completed) */
  output?: unknown;
  /** Error information (when failed) */
  error?: WorkflowError;
  /** ISO timestamp when the run was created */
  createdAt: string;
  /** ISO timestamp when the run was last updated */
  updatedAt: string;
  /** ISO timestamp when the run started executing */
  startedAt?: string;
  /** ISO timestamp when the run completed */
  completedAt?: string;
  /** Custom metadata attached to the run */
  metadata?: Record<string, unknown>;
}

/**
 * Represents a step within a workflow run
 */
export interface Step {
  /** Unique identifier for the step */
  id: string;
  /** Run ID this step belongs to */
  runId: string;
  /** Step name/identifier in the workflow definition */
  stepName: string;
  /** Current status of the step */
  status: StepStatus;
  /** Input data for the step */
  input?: unknown;
  /** Output data from the step (when completed) */
  output?: unknown;
  /** Error information (when failed) */
  error?: WorkflowError;
  /** Number of execution attempts */
  attempts: number;
  /** ISO timestamp when the step was created */
  createdAt: string;
  /** ISO timestamp when the step was last updated */
  updatedAt: string;
  /** ISO timestamp when the step started executing */
  startedAt?: string;
  /** ISO timestamp when the step completed */
  completedAt?: string;
  /** Cache key for step result caching */
  cacheKey?: string;
}

/**
 * Represents an event in a workflow run's history
 */
export interface WorkflowEvent {
  /** Unique identifier for the event */
  id: string;
  /** Run ID this event belongs to */
  runId: string;
  /** Event type identifier */
  type: string;
  /** Event payload data */
  data: unknown;
  /** ISO timestamp when the event occurred */
  timestamp: string;
  /** Sequence number for ordering */
  sequence: number;
}

/**
 * Represents a webhook callback registration
 */
export interface Hook {
  /** Unique token for the hook */
  token: string;
  /** Run ID this hook belongs to */
  runId: string;
  /** Step ID this hook belongs to */
  stepId: string;
  /** Callback URL or identifier */
  callbackUrl?: string;
  /** ISO timestamp when the hook was created */
  createdAt: string;
  /** ISO timestamp when the hook expires */
  expiresAt?: string;
  /** Whether the hook has been invoked */
  invoked: boolean;
  /** Payload received when invoked */
  payload?: unknown;
}

/**
 * Structured error information
 */
export interface WorkflowError {
  /** Error message */
  message: string;
  /** Error code/type */
  code?: string;
  /** Stack trace (if available) */
  stack?: string;
  /** Additional error details */
  details?: Record<string, unknown>;
}

/**
 * Options for listing runs
 */
export interface ListRunsOptions {
  /** Filter by workflow ID */
  workflowId?: string;
  /** Filter by status */
  status?: RunStatus;
  /** Maximum number of results */
  limit?: number;
  /** Cursor for pagination */
  cursor?: string;
}

/**
 * Paginated list result
 */
export interface ListResult<T> {
  /** Items in this page */
  items: T[];
  /** Cursor for next page (if more results exist) */
  nextCursor?: string;
  /** Total count (if available) */
  totalCount?: number;
}

/**
 * Storage interface for workflow persistence
 */
export interface Storage {
  // Run operations
  createRun(run: Run): Promise<void>;
  getRun(runId: string): Promise<Run | null>;
  updateRun(runId: string, updates: Partial<Run>): Promise<void>;
  deleteRun(runId: string): Promise<void>;
  listRuns(options?: ListRunsOptions): Promise<ListResult<Run>>;

  // Step operations
  createStep(step: Step): Promise<void>;
  getStep(runId: string, stepId: string): Promise<Step | null>;
  updateStep(runId: string, stepId: string, updates: Partial<Step>): Promise<void>;
  deleteStep(runId: string, stepId: string): Promise<void>;
  listSteps(runId: string): Promise<Step[]>;
  getStepByCacheKey(cacheKey: string): Promise<Step | null>;

  // Event operations
  createEvent(event: Omit<WorkflowEvent, 'id' | 'sequence'>): Promise<WorkflowEvent>;
  getEvents(runId: string, afterSequence?: number): Promise<WorkflowEvent[]>;

  // Hook operations
  createHook(hook: Hook): Promise<void>;
  getHook(token: string): Promise<Hook | null>;
  updateHook(token: string, updates: Partial<Hook>): Promise<void>;
  deleteHook(token: string): Promise<void>;
}

// ============================================================================
// Queue Types
// ============================================================================

/**
 * Message in the workflow queue
 */
export interface QueueMessage<T = unknown> {
  /** Unique message identifier */
  id: string;
  /** Queue name this message belongs to */
  queueName: string;
  /** Message payload */
  payload: T;
  /** Unix timestamp when the message was created */
  createdAt: number;
  /** Unix timestamp when the message becomes visible */
  visibleAt: number;
  /** Number of delivery attempts */
  attempts: number;
  /** Maximum delivery attempts before DLQ */
  maxAttempts: number;
  /** Correlation ID for tracing */
  correlationId?: string;
}

/**
 * Options for sending a message to the queue
 */
export interface SendMessageOptions {
  /** Delay in milliseconds before the message becomes visible */
  delayMs?: number;
  /** Maximum delivery attempts (default: 3) */
  maxAttempts?: number;
  /** Correlation ID for tracing */
  correlationId?: string;
}

/**
 * Handler function for processing queue messages
 */
export type MessageHandler<T = unknown> = (message: QueueMessage<T>) => Promise<void>;

/**
 * Subscription options for queue consumers
 */
export interface SubscribeOptions {
  /** Maximum concurrent message processing (default: 1) */
  concurrency?: number;
  /** Visibility timeout in milliseconds (default: 30000) */
  visibilityTimeout?: number;
  /** Whether to auto-acknowledge on successful processing (default: true) */
  autoAck?: boolean;
}

/**
 * Queue interface for workflow message passing
 */
export interface Queue {
  /** Send a message to a queue */
  send<T>(queueName: string, payload: T, options?: SendMessageOptions): Promise<string>;

  /** Subscribe to messages from a queue */
  subscribe<T>(
    queueName: string,
    handler: MessageHandler<T>,
    options?: SubscribeOptions
  ): Promise<Subscription>;

  /** Acknowledge successful processing of a message */
  ack(queueName: string, messageId: string): Promise<void>;

  /** Negative acknowledge - return message to queue */
  nack(queueName: string, messageId: string, requeue?: boolean): Promise<void>;
}

/**
 * Represents an active subscription
 */
export interface Subscription {
  /** Unsubscribe from the queue */
  unsubscribe(): Promise<void>;
  /** Check if subscription is active */
  isActive(): boolean;
}

// ============================================================================
// Streamer Types
// ============================================================================

/**
 * Chunk of data in a stream
 */
export interface StreamChunk<T = unknown> {
  /** Unique chunk identifier */
  id: string;
  /** Stream ID this chunk belongs to */
  streamId: string;
  /** Chunk data */
  data: T;
  /** Sequence number for ordering */
  sequence: number;
  /** Unix timestamp when the chunk was created */
  timestamp: number;
}

/**
 * Stream metadata
 */
export interface StreamMetadata {
  /** Stream identifier */
  id: string;
  /** Whether the stream is open for writing */
  isOpen: boolean;
  /** Unix timestamp when the stream was created */
  createdAt: number;
  /** Unix timestamp when the stream was closed */
  closedAt?: number;
  /** Total number of chunks in the stream */
  chunkCount: number;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Options for creating a stream
 */
export interface CreateStreamOptions {
  /** Custom metadata to attach to the stream */
  metadata?: Record<string, unknown>;
}

/**
 * Handler function for stream chunks
 */
export type StreamHandler<T = unknown> = (chunk: StreamChunk<T>) => void;

/**
 * Options for subscribing to a stream
 */
export interface StreamSubscribeOptions {
  /** Start from this sequence number (default: 0 for replay from beginning) */
  fromSequence?: number;
  /** Only receive new chunks (ignore history) */
  liveOnly?: boolean;
}

/**
 * Represents a writable stream
 */
export interface WritableStream<T = unknown> {
  /** Stream identifier */
  readonly id: string;
  /** Write a chunk to the stream */
  write(data: T): Promise<void>;
  /** Close the stream */
  close(): Promise<void>;
  /** Check if the stream is open */
  isOpen(): boolean;
}

/**
 * Represents a stream subscription
 */
export interface StreamSubscription {
  /** Unsubscribe from the stream */
  unsubscribe(): Promise<void>;
  /** Check if subscription is active */
  isActive(): boolean;
}

/**
 * Streamer interface for real-time data streaming
 */
export interface Streamer {
  /** Create a new writable stream */
  createStream<T>(streamId: string, options?: CreateStreamOptions): Promise<WritableStream<T>>;

  /** Get stream metadata */
  getStreamMetadata(streamId: string): Promise<StreamMetadata | null>;

  /** Subscribe to a stream (with optional replay) */
  subscribe<T>(
    streamId: string,
    handler: StreamHandler<T>,
    options?: StreamSubscribeOptions
  ): Promise<StreamSubscription>;

  /** Get all chunks from a stream */
  getChunks<T>(streamId: string, fromSequence?: number): Promise<StreamChunk<T>[]>;

  /** Delete a stream and all its chunks */
  deleteStream(streamId: string): Promise<void>;
}

// ============================================================================
// World Interface
// ============================================================================

/**
 * The World interface combines Storage, Queue, and Streamer
 * to provide the complete infrastructure layer for workflow execution
 */
export interface World {
  /** Storage for workflow state persistence */
  storage: Storage;
  /** Queue for workflow/step invocation */
  queue: Queue;
  /** Streamer for real-time data */
  streamer: Streamer;
  /** Start the world (connect to infrastructure) */
  start?(): Promise<void>;
  /** Stop the world (disconnect from infrastructure) */
  stop?(): Promise<void>;
  /** Check if the world is ready */
  isReady(): boolean;
}

// ============================================================================
// Dapr-Specific Types
// ============================================================================

/**
 * Dapr state store key prefixes
 */
export const StateKeyPrefixes = {
  RUN: 'workflow:run',
  RUNS_INDEX: 'workflow:runs:index',
  STEP: 'workflow:step',
  STEPS_INDEX: 'workflow:steps:index',
  EVENT: 'workflow:event',
  EVENTS_INDEX: 'workflow:events:index',
  EVENT_COUNTER: 'workflow:event:counter',
  HOOK: 'workflow:hook',
  STREAM: 'workflow:stream',
  STREAM_CHUNKS: 'workflow:stream:chunks',
  STREAM_COUNTER: 'workflow:stream:counter',
  CACHE: 'workflow:cache',
} as const;

/**
 * Dapr pub/sub topic patterns
 */
export const PubSubTopics = {
  QUEUE_PREFIX: 'workflow-queue',
  STREAM_PREFIX: 'workflow-stream',
  DLQ_SUFFIX: '-dlq',
} as const;

/**
 * State transaction operation
 */
export interface StateOperation {
  operation: 'upsert' | 'delete';
  request: {
    key: string;
    value?: unknown;
  };
}
