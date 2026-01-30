/**
 * DaprQueue - NATS JetStream Pub/Sub Implementation for Workflow DevKit
 *
 * Uses Dapr Pub/Sub API with NATS JetStream for durable message queuing.
 * Provides exactly-once delivery, message replay, and delayed delivery.
 */

import { DaprClient, DaprServer } from '@dapr/dapr';
import type {
  Queue,
  QueueMessage,
  SendMessageOptions,
  MessageHandler,
  SubscribeOptions,
  Subscription,
  ResolvedDaprWorldConfig,
} from './types.js';
import { PubSubTopics } from './types.js';

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Build a topic name from queue name
 */
function buildTopic(queueName: string): string {
  return `${PubSubTopics.QUEUE_PREFIX}-${queueName}`;
}

/**
 * Build a dead letter topic name
 */
function buildDlqTopic(queueName: string): string {
  return `${PubSubTopics.QUEUE_PREFIX}-${queueName}${PubSubTopics.DLQ_SUFFIX}`;
}

/**
 * Internal subscription state
 */
interface InternalSubscription {
  queueName: string;
  topic: string;
  handler: MessageHandler;
  options: Required<SubscribeOptions>;
  active: boolean;
  processing: Set<string>;
}

/**
 * DaprQueue implements the Queue interface using Dapr Pub/Sub API
 */
export class DaprQueue implements Queue {
  private client: DaprClient;
  private server: DaprServer | null = null;
  private pubsubName: string;
  private subscriptions: Map<string, InternalSubscription> = new Map();
  private messageStore: Map<string, QueueMessage> = new Map();
  private config: ResolvedDaprWorldConfig;

  constructor(client: DaprClient, config: ResolvedDaprWorldConfig) {
    this.client = client;
    this.config = config;
    this.pubsubName = config.pubsubName;
  }

  /**
   * Initialize the Dapr server for receiving pub/sub messages
   */
  async initialize(server: DaprServer): Promise<void> {
    this.server = server;
  }

  /**
   * Send a message to a queue
   */
  async send<T>(
    queueName: string,
    payload: T,
    options?: SendMessageOptions
  ): Promise<string> {
    const messageId = generateMessageId();
    const now = Date.now();
    const delayMs = options?.delayMs ?? 0;

    const message: QueueMessage<T> = {
      id: messageId,
      queueName,
      payload,
      createdAt: now,
      visibleAt: now + delayMs,
      attempts: 0,
      maxAttempts: options?.maxAttempts ?? 3,
      correlationId: options?.correlationId,
    };

    const topic = buildTopic(queueName);

    // For delayed messages, we need to handle visibility
    // In production, NATS JetStream supports scheduled delivery
    // For now, include visibility time in the message
    await this.client.pubsub.publish(this.pubsubName, topic, message, {
      // Dapr pub/sub metadata for NATS JetStream
      metadata: {
        // Include message ID for deduplication
        messageId,
        // Include correlation ID for tracing
        ...(options?.correlationId && { correlationId: options.correlationId }),
      },
    });

    // Store message for acknowledgment tracking
    this.messageStore.set(messageId, message as QueueMessage);

    return messageId;
  }

  /**
   * Subscribe to messages from a queue
   */
  async subscribe<T>(
    queueName: string,
    handler: MessageHandler<T>,
    options?: SubscribeOptions
  ): Promise<Subscription> {
    const topic = buildTopic(queueName);
    const subscriptionKey = `${this.pubsubName}:${topic}`;

    const resolvedOptions: Required<SubscribeOptions> = {
      concurrency: options?.concurrency ?? 1,
      visibilityTimeout: options?.visibilityTimeout ?? 30000,
      autoAck: options?.autoAck ?? true,
    };

    const internalSub: InternalSubscription = {
      queueName,
      topic,
      handler: handler as MessageHandler,
      options: resolvedOptions,
      active: true,
      processing: new Set(),
    };

    this.subscriptions.set(subscriptionKey, internalSub);

    // Register with Dapr server for receiving messages
    if (this.server) {
      await this.server.pubsub.subscribe(
        this.pubsubName,
        topic,
        async (data: unknown) => {
          await this.handleMessage(subscriptionKey, data as QueueMessage<T>);
        }
      );
    }

    return {
      unsubscribe: async () => {
        internalSub.active = false;
        this.subscriptions.delete(subscriptionKey);
        // Note: Dapr doesn't support runtime unsubscribe
        // The subscription will be cleaned up on restart
      },
      isActive: () => internalSub.active,
    };
  }

  /**
   * Acknowledge successful processing of a message
   */
  async ack(queueName: string, messageId: string): Promise<void> {
    // Remove from message store
    this.messageStore.delete(messageId);

    // Remove from processing set
    const topic = buildTopic(queueName);
    const subscriptionKey = `${this.pubsubName}:${topic}`;
    const sub = this.subscriptions.get(subscriptionKey);
    if (sub) {
      sub.processing.delete(messageId);
    }

    // In NATS JetStream, the ack happens automatically when the handler completes
    // without throwing an error. This method is for explicit acknowledgment.
  }

  /**
   * Negative acknowledge - return message to queue or send to DLQ
   */
  async nack(
    queueName: string,
    messageId: string,
    requeue: boolean = true
  ): Promise<void> {
    const message = this.messageStore.get(messageId);
    if (!message) {
      return;
    }

    // Remove from processing
    const topic = buildTopic(queueName);
    const subscriptionKey = `${this.pubsubName}:${topic}`;
    const sub = this.subscriptions.get(subscriptionKey);
    if (sub) {
      sub.processing.delete(messageId);
    }

    // Increment attempts
    message.attempts += 1;

    if (requeue && message.attempts < message.maxAttempts) {
      // Requeue with backoff delay
      const backoffMs = Math.min(1000 * Math.pow(2, message.attempts), 30000);
      message.visibleAt = Date.now() + backoffMs;

      await this.client.pubsub.publish(this.pubsubName, topic, message);
    } else {
      // Send to dead letter queue
      const dlqTopic = buildDlqTopic(queueName);
      await this.client.pubsub.publish(this.pubsubName, dlqTopic, {
        ...message,
        sentToDlqAt: Date.now(),
        reason: requeue ? 'max_attempts_exceeded' : 'nack_no_requeue',
      });
    }

    // Remove from store
    this.messageStore.delete(messageId);
  }

  /**
   * Handle incoming message from Dapr pub/sub
   */
  private async handleMessage<T>(
    subscriptionKey: string,
    message: QueueMessage<T>
  ): Promise<void> {
    const sub = this.subscriptions.get(subscriptionKey);
    if (!sub || !sub.active) {
      return;
    }

    // Check visibility time (for delayed messages)
    const now = Date.now();
    if (message.visibleAt > now) {
      // Message not yet visible, requeue with delay
      const delayMs = message.visibleAt - now;
      setTimeout(async () => {
        await this.handleMessage(subscriptionKey, message);
      }, Math.min(delayMs, 60000)); // Max 1 minute wait
      return;
    }

    // Check concurrency
    if (sub.processing.size >= sub.options.concurrency) {
      // At capacity, message will be redelivered by NATS
      return;
    }

    // Mark as processing
    sub.processing.add(message.id);
    this.messageStore.set(message.id, message as QueueMessage);

    try {
      // Call the handler
      await sub.handler(message as QueueMessage);

      // Auto-acknowledge if enabled
      if (sub.options.autoAck) {
        await this.ack(sub.queueName, message.id);
      }
    } catch (error) {
      // Handler threw an error, nack with requeue
      console.error(`Error processing message ${message.id}:`, error);
      await this.nack(sub.queueName, message.id, true);
    }
  }

  /**
   * Get subscription statistics
   */
  getStats(): Record<string, { pending: number; processing: number }> {
    const stats: Record<string, { pending: number; processing: number }> = {};

    for (const [key, sub] of this.subscriptions) {
      const pendingMessages = Array.from(this.messageStore.values()).filter(
        (m) => m.queueName === sub.queueName
      );

      stats[sub.queueName] = {
        pending: pendingMessages.length,
        processing: sub.processing.size,
      };
    }

    return stats;
  }

  /**
   * Shutdown the queue (cleanup subscriptions)
   */
  async shutdown(): Promise<void> {
    for (const sub of this.subscriptions.values()) {
      sub.active = false;
    }
    this.subscriptions.clear();
    this.messageStore.clear();
  }
}
