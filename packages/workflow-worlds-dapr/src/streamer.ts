/**
 * DaprStreamer - Real-time Data Streaming Implementation for Workflow DevKit
 *
 * Uses Dapr Pub/Sub for real-time message delivery and State Store for
 * chunk persistence, enabling replay capability.
 */

import { DaprClient, DaprServer } from '@dapr/dapr';
import type {
  Streamer,
  StreamChunk,
  StreamMetadata,
  CreateStreamOptions,
  StreamHandler,
  StreamSubscribeOptions,
  StreamSubscription,
  WritableStream,
  ResolvedDaprWorldConfig,
} from './types.js';
import { StateKeyPrefixes, PubSubTopics } from './types.js';

/**
 * Build state key for stream metadata
 */
function buildStreamKey(streamId: string): string {
  return `${StateKeyPrefixes.STREAM}:${streamId}`;
}

/**
 * Build state key for stream chunks
 */
function buildChunkKey(streamId: string, sequence: number): string {
  return `${StateKeyPrefixes.STREAM_CHUNKS}:${streamId}:${sequence}`;
}

/**
 * Build state key for stream counter
 */
function buildCounterKey(streamId: string): string {
  return `${StateKeyPrefixes.STREAM_COUNTER}:${streamId}`;
}

/**
 * Build pub/sub topic for stream
 */
function buildStreamTopic(streamId: string): string {
  return `${PubSubTopics.STREAM_PREFIX}-${streamId}`;
}

/**
 * Internal writable stream implementation
 */
class DaprWritableStream<T> implements WritableStream<T> {
  readonly id: string;
  private client: DaprClient;
  private stateStoreName: string;
  private pubsubName: string;
  private open: boolean = true;
  private sequence: number = 0;

  constructor(
    id: string,
    client: DaprClient,
    stateStoreName: string,
    pubsubName: string,
    initialSequence: number = 0
  ) {
    this.id = id;
    this.client = client;
    this.stateStoreName = stateStoreName;
    this.pubsubName = pubsubName;
    this.sequence = initialSequence;
  }

  async write(data: T): Promise<void> {
    if (!this.open) {
      throw new Error(`Stream ${this.id} is closed`);
    }

    this.sequence += 1;
    const chunk: StreamChunk<T> = {
      id: `${this.id}-chunk-${this.sequence}`,
      streamId: this.id,
      data,
      sequence: this.sequence,
      timestamp: Date.now(),
    };

    // Persist chunk to state store
    await this.client.state.save(this.stateStoreName, [
      { key: buildChunkKey(this.id, this.sequence), value: chunk },
      { key: buildCounterKey(this.id), value: this.sequence },
    ]);

    // Update stream metadata
    const metadataKey = buildStreamKey(this.id);
    const metadata = (await this.client.state.get(
      this.stateStoreName,
      metadataKey
    )) as StreamMetadata | null;

    if (metadata) {
      await this.client.state.save(this.stateStoreName, [
        {
          key: metadataKey,
          value: { ...metadata, chunkCount: this.sequence },
        },
      ]);
    }

    // Publish chunk for real-time subscribers
    const topic = buildStreamTopic(this.id);
    await this.client.pubsub.publish(this.pubsubName, topic, chunk);
  }

  async close(): Promise<void> {
    if (!this.open) {
      return;
    }

    this.open = false;

    // Update stream metadata to closed
    const metadataKey = buildStreamKey(this.id);
    const metadata = (await this.client.state.get(
      this.stateStoreName,
      metadataKey
    )) as StreamMetadata | null;

    if (metadata) {
      await this.client.state.save(this.stateStoreName, [
        {
          key: metadataKey,
          value: {
            ...metadata,
            isOpen: false,
            closedAt: Date.now(),
          },
        },
      ]);
    }

    // Publish close signal
    const topic = buildStreamTopic(this.id);
    await this.client.pubsub.publish(this.pubsubName, topic, {
      type: 'stream_closed',
      streamId: this.id,
      timestamp: Date.now(),
    });
  }

  isOpen(): boolean {
    return this.open;
  }
}

/**
 * Internal subscription state
 */
interface InternalStreamSubscription {
  streamId: string;
  handler: StreamHandler;
  active: boolean;
  lastSequence: number;
}

/**
 * DaprStreamer implements the Streamer interface using Dapr Pub/Sub and State Store
 */
export class DaprStreamer implements Streamer {
  private client: DaprClient;
  private server: DaprServer | null = null;
  private stateStoreName: string;
  private pubsubName: string;
  private subscriptions: Map<string, InternalStreamSubscription[]> = new Map();
  private streams: Map<string, DaprWritableStream<unknown>> = new Map();

  constructor(client: DaprClient, config: ResolvedDaprWorldConfig) {
    this.client = client;
    this.stateStoreName = config.stateStoreName;
    this.pubsubName = config.pubsubName;
  }

  /**
   * Initialize the Dapr server for receiving pub/sub messages
   */
  async initialize(server: DaprServer): Promise<void> {
    this.server = server;
  }

  /**
   * Create a new writable stream
   */
  async createStream<T>(
    streamId: string,
    options?: CreateStreamOptions
  ): Promise<WritableStream<T>> {
    // Check if stream already exists
    const existing = await this.getStreamMetadata(streamId);
    if (existing) {
      if (existing.isOpen) {
        throw new Error(`Stream ${streamId} already exists and is open`);
      }
      // Stream was closed, can be reopened by creating new
    }

    const now = Date.now();
    const metadata: StreamMetadata = {
      id: streamId,
      isOpen: true,
      createdAt: now,
      chunkCount: 0,
      metadata: options?.metadata,
    };

    // Save stream metadata
    await this.client.state.save(this.stateStoreName, [
      { key: buildStreamKey(streamId), value: metadata },
      { key: buildCounterKey(streamId), value: 0 },
    ]);

    // Create writable stream
    const stream = new DaprWritableStream<T>(
      streamId,
      this.client,
      this.stateStoreName,
      this.pubsubName,
      0
    );

    this.streams.set(streamId, stream as DaprWritableStream<unknown>);

    return stream;
  }

  /**
   * Get stream metadata
   */
  async getStreamMetadata(streamId: string): Promise<StreamMetadata | null> {
    const key = buildStreamKey(streamId);
    const result = await this.client.state.get(this.stateStoreName, key);
    return result as StreamMetadata | null;
  }

  /**
   * Subscribe to a stream with optional replay
   */
  async subscribe<T>(
    streamId: string,
    handler: StreamHandler<T>,
    options?: StreamSubscribeOptions
  ): Promise<StreamSubscription> {
    const metadata = await this.getStreamMetadata(streamId);

    const internalSub: InternalStreamSubscription = {
      streamId,
      handler: handler as StreamHandler,
      active: true,
      lastSequence: options?.fromSequence ?? 0,
    };

    // Add to subscriptions map
    const subs = this.subscriptions.get(streamId) ?? [];
    subs.push(internalSub);
    this.subscriptions.set(streamId, subs);

    // Replay historical chunks if not liveOnly
    if (!options?.liveOnly && metadata) {
      const chunks = await this.getChunks<T>(streamId, options?.fromSequence);
      for (const chunk of chunks) {
        if (internalSub.active) {
          handler(chunk);
          internalSub.lastSequence = chunk.sequence;
        }
      }
    }

    // Subscribe to real-time updates
    const topic = buildStreamTopic(streamId);
    if (this.server) {
      await this.server.pubsub.subscribe(
        this.pubsubName,
        topic,
        async (data: unknown) => {
          await this.handleStreamMessage(streamId, data);
        }
      );
    }

    return {
      unsubscribe: async () => {
        internalSub.active = false;
        const currentSubs = this.subscriptions.get(streamId) ?? [];
        const updatedSubs = currentSubs.filter((s) => s !== internalSub);
        if (updatedSubs.length > 0) {
          this.subscriptions.set(streamId, updatedSubs);
        } else {
          this.subscriptions.delete(streamId);
        }
      },
      isActive: () => internalSub.active,
    };
  }

  /**
   * Get all chunks from a stream
   */
  async getChunks<T>(
    streamId: string,
    fromSequence?: number
  ): Promise<StreamChunk<T>[]> {
    const metadata = await this.getStreamMetadata(streamId);
    if (!metadata) {
      return [];
    }

    const startSequence = (fromSequence ?? 0) + 1;
    const chunks: StreamChunk<T>[] = [];

    // Fetch chunks from state store
    for (let seq = startSequence; seq <= metadata.chunkCount; seq++) {
      const key = buildChunkKey(streamId, seq);
      const chunk = (await this.client.state.get(
        this.stateStoreName,
        key
      )) as StreamChunk<T> | null;

      if (chunk) {
        chunks.push(chunk);
      }
    }

    return chunks.sort((a, b) => a.sequence - b.sequence);
  }

  /**
   * Delete a stream and all its chunks
   */
  async deleteStream(streamId: string): Promise<void> {
    const metadata = await this.getStreamMetadata(streamId);
    if (!metadata) {
      return;
    }

    // Delete all chunks
    for (let seq = 1; seq <= metadata.chunkCount; seq++) {
      const key = buildChunkKey(streamId, seq);
      await this.client.state.delete(this.stateStoreName, key);
    }

    // Delete metadata and counter
    await this.client.state.delete(this.stateStoreName, buildStreamKey(streamId));
    await this.client.state.delete(this.stateStoreName, buildCounterKey(streamId));

    // Remove from local caches
    this.streams.delete(streamId);
    this.subscriptions.delete(streamId);
  }

  /**
   * Handle incoming stream message from Dapr pub/sub
   */
  private async handleStreamMessage(
    streamId: string,
    data: unknown
  ): Promise<void> {
    const subs = this.subscriptions.get(streamId);
    if (!subs || subs.length === 0) {
      return;
    }

    // Check if this is a close signal
    if (
      typeof data === 'object' &&
      data !== null &&
      'type' in data &&
      (data as { type: string }).type === 'stream_closed'
    ) {
      // Stream closed, no action needed for subscribers
      return;
    }

    const chunk = data as StreamChunk;

    for (const sub of subs) {
      if (!sub.active) continue;

      // Only deliver if chunk is after last seen sequence
      if (chunk.sequence > sub.lastSequence) {
        try {
          sub.handler(chunk);
          sub.lastSequence = chunk.sequence;
        } catch (error) {
          console.error(
            `Error in stream handler for ${streamId}:`,
            error
          );
        }
      }
    }
  }

  /**
   * Shutdown the streamer
   */
  async shutdown(): Promise<void> {
    // Close all open streams
    for (const stream of this.streams.values()) {
      if (stream.isOpen()) {
        await stream.close();
      }
    }
    this.streams.clear();

    // Deactivate all subscriptions
    for (const subs of this.subscriptions.values()) {
      for (const sub of subs) {
        sub.active = false;
      }
    }
    this.subscriptions.clear();
  }
}
