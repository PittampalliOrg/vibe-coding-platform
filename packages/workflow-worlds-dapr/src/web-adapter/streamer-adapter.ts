/**
 * Streamer Adapter for @workflow/web Compatibility
 *
 * Adapts our DaprStreamer interface to the Vercel @workflow/world Streamer interface.
 * This enables @workflow/web to read streaming data from our Dapr-based storage.
 */

import type { DaprStreamer } from '../streamer.js';
import type { VercelStreamer } from './types.js';

/**
 * Creates a Vercel-compatible Streamer interface wrapping our DaprStreamer
 *
 * Note: The Vercel Streamer interface is simpler than ours:
 * - writeToStream(name, runId, chunk)
 * - closeStream(name, runId)
 * - readFromStream(name, startIndex)
 * - listStreamsByRunId(runId)
 *
 * Our interface is more feature-rich:
 * - createStream(streamId, options)
 * - subscribe(streamId, handler, options)
 * - getChunks(streamId, fromSequence)
 * - getStreamMetadata(streamId)
 * - deleteStream(streamId)
 */
export function createStreamerAdapter(streamer: DaprStreamer): VercelStreamer {
  // Track active streams by name for write operations
  const activeStreams = new Map<string, { write: (data: unknown) => Promise<void>; close: () => Promise<void> }>();

  /**
   * Build a stream ID from name and runId
   * Vercel uses name + runId to identify streams
   */
  function buildStreamId(name: string, runId: string): string {
    return `${runId}:${name}`;
  }

  return {
    /**
     * Write a chunk to a stream
     */
    async writeToStream(
      name: string,
      runId: string | Promise<string>,
      chunk: string | Uint8Array
    ): Promise<void> {
      const resolvedRunId = await runId;
      const streamId = buildStreamId(name, resolvedRunId);

      // Get or create the stream
      let stream = activeStreams.get(streamId);
      if (!stream) {
        const writableStream = await streamer.createStream<string | Uint8Array>(streamId);
        stream = {
          write: (data) => writableStream.write(data as string | Uint8Array),
          close: () => writableStream.close(),
        };
        activeStreams.set(streamId, stream);
      }

      // Write the chunk
      await stream.write(chunk);
    },

    /**
     * Close a stream
     */
    async closeStream(
      name: string,
      runId: string | Promise<string>
    ): Promise<void> {
      const resolvedRunId = await runId;
      const streamId = buildStreamId(name, resolvedRunId);

      const stream = activeStreams.get(streamId);
      if (stream) {
        await stream.close();
        activeStreams.delete(streamId);
      }
    },

    /**
     * Read from a stream as a ReadableStream
     *
     * This converts our chunk-based storage to a standard ReadableStream
     */
    async readFromStream(
      name: string,
      startIndex?: number
    ): Promise<ReadableStream<Uint8Array>> {
      // Note: This is a simplified implementation
      // In a real scenario, we'd need the runId to build the full streamId
      // For the web UI, we'll list all streams and find the one matching the name

      // Create a ReadableStream that yields chunks from our storage
      return new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            // Get chunks from the stream
            // We need to search for streams by name suffix since we don't have runId
            const chunks = await streamer.getChunks<string | Uint8Array>(name, startIndex ?? 0);

            for (const chunk of chunks) {
              // Convert string to Uint8Array if needed
              const data =
                typeof chunk.data === 'string'
                  ? new TextEncoder().encode(chunk.data)
                  : chunk.data;
              controller.enqueue(data as Uint8Array);
            }

            controller.close();
          } catch (error) {
            // Stream might not exist, return empty
            controller.close();
          }
        },
      });
    },

    /**
     * List all streams for a given runId
     */
    async listStreamsByRunId(runId: string): Promise<string[]> {
      // Our storage doesn't have a native way to list streams by runId
      // This would require maintaining an index of streams per run
      // For now, return empty array - this could be enhanced
      console.warn(
        `[StreamerAdapter] listStreamsByRunId not fully implemented, runId: ${runId}`
      );
      return [];
    },
  };
}

/**
 * Enhanced Streamer Adapter with run-aware stream tracking
 *
 * This version maintains an index of streams per run for better compatibility
 */
export function createEnhancedStreamerAdapter(
  streamer: DaprStreamer,
  storage: { getState: (key: string) => Promise<unknown>; setState: (key: string, value: unknown) => Promise<void> }
): VercelStreamer {
  const STREAMS_INDEX_PREFIX = 'workflow:streams:index';

  async function getStreamsIndex(runId: string): Promise<string[]> {
    const key = `${STREAMS_INDEX_PREFIX}:${runId}`;
    const index = await storage.getState(key);
    return (index as string[]) ?? [];
  }

  async function addToStreamsIndex(runId: string, name: string): Promise<void> {
    const key = `${STREAMS_INDEX_PREFIX}:${runId}`;
    const index = await getStreamsIndex(runId);
    if (!index.includes(name)) {
      await storage.setState(key, [...index, name]);
    }
  }

  const activeStreams = new Map<string, { write: (data: unknown) => Promise<void>; close: () => Promise<void> }>();

  function buildStreamId(name: string, runId: string): string {
    return `${runId}:${name}`;
  }

  return {
    async writeToStream(
      name: string,
      runId: string | Promise<string>,
      chunk: string | Uint8Array
    ): Promise<void> {
      const resolvedRunId = await runId;
      const streamId = buildStreamId(name, resolvedRunId);

      let stream = activeStreams.get(streamId);
      if (!stream) {
        const writableStream = await streamer.createStream<string | Uint8Array>(streamId);
        stream = {
          write: (data) => writableStream.write(data as string | Uint8Array),
          close: () => writableStream.close(),
        };
        activeStreams.set(streamId, stream);

        // Track this stream in the index
        await addToStreamsIndex(resolvedRunId, name);
      }

      await stream.write(chunk);
    },

    async closeStream(
      name: string,
      runId: string | Promise<string>
    ): Promise<void> {
      const resolvedRunId = await runId;
      const streamId = buildStreamId(name, resolvedRunId);

      const stream = activeStreams.get(streamId);
      if (stream) {
        await stream.close();
        activeStreams.delete(streamId);
      }
    },

    async readFromStream(
      name: string,
      startIndex?: number
    ): Promise<ReadableStream<Uint8Array>> {
      return new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            const chunks = await streamer.getChunks<string | Uint8Array>(name, startIndex ?? 0);

            for (const chunk of chunks) {
              const data =
                typeof chunk.data === 'string'
                  ? new TextEncoder().encode(chunk.data)
                  : chunk.data;
              controller.enqueue(data as Uint8Array);
            }

            controller.close();
          } catch {
            controller.close();
          }
        },
      });
    },

    async listStreamsByRunId(runId: string): Promise<string[]> {
      return getStreamsIndex(runId);
    },
  };
}
