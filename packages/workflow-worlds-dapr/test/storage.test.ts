/**
 * DaprStorage Unit Tests
 *
 * These tests mock the Dapr client to test storage operations
 * without requiring a running Dapr sidecar.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DaprStorage } from '../src/storage.js';
import type { Run, Step, Hook, ResolvedDaprWorldConfig } from '../src/types.js';

// Mock Dapr client
const mockStateGet = vi.fn();
const mockStateSave = vi.fn();
const mockStateDelete = vi.fn();

const mockClient = {
  state: {
    get: mockStateGet,
    save: mockStateSave,
    delete: mockStateDelete,
  },
} as unknown as import('@dapr/dapr').DaprClient;

const mockConfig: ResolvedDaprWorldConfig = {
  stateStoreName: 'test-statestore',
  pubsubName: 'test-pubsub',
  deploymentId: 'test-deployment',
  daprHost: '127.0.0.1',
  daprHttpPort: 3500,
  daprGrpcPort: 50001,
  useGrpc: false,
  connectionTimeout: 5000,
  maxRetries: 3,
};

describe('DaprStorage', () => {
  let storage: DaprStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DaprStorage(mockClient, mockConfig);
  });

  describe('initialize', () => {
    it('should create runs index if not exists', async () => {
      mockStateGet.mockResolvedValueOnce(null);
      mockStateSave.mockResolvedValueOnce(undefined);

      await storage.initialize();

      expect(mockStateGet).toHaveBeenCalledWith('test-statestore', 'workflow:runs:index');
      expect(mockStateSave).toHaveBeenCalledWith('test-statestore', [
        { key: 'workflow:runs:index', value: [] },
      ]);
    });

    it('should not recreate runs index if exists', async () => {
      mockStateGet.mockResolvedValueOnce(['existing-run']);

      await storage.initialize();

      expect(mockStateSave).not.toHaveBeenCalled();
    });
  });

  describe('createRun', () => {
    it('should create a run and update index', async () => {
      const run: Run = {
        id: 'run-123',
        workflowId: 'workflow-abc',
        status: 'pending',
        input: { foo: 'bar' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockStateGet.mockResolvedValueOnce([]); // runs index
      mockStateSave.mockResolvedValue(undefined);

      await storage.createRun(run);

      expect(mockStateSave).toHaveBeenCalledWith('test-statestore', [
        { key: 'workflow:run:run-123', value: run },
        { key: 'workflow:runs:index', value: ['run-123'] },
      ]);
    });
  });

  describe('getRun', () => {
    it('should return run if exists', async () => {
      const run: Run = {
        id: 'run-123',
        workflowId: 'workflow-abc',
        status: 'running',
        input: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockStateGet.mockResolvedValueOnce(run);

      const result = await storage.getRun('run-123');

      expect(result).toEqual(run);
      expect(mockStateGet).toHaveBeenCalledWith('test-statestore', 'workflow:run:run-123');
    });

    it('should return null if run does not exist', async () => {
      mockStateGet.mockResolvedValueOnce(null);

      const result = await storage.getRun('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateRun', () => {
    it('should update run with new values', async () => {
      const existingRun: Run = {
        id: 'run-123',
        workflowId: 'workflow-abc',
        status: 'running',
        input: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockStateGet.mockResolvedValueOnce(existingRun);
      mockStateSave.mockResolvedValueOnce(undefined);

      await storage.updateRun('run-123', { status: 'completed', output: { result: 'success' } });

      expect(mockStateSave).toHaveBeenCalledWith(
        'test-statestore',
        expect.arrayContaining([
          expect.objectContaining({
            key: 'workflow:run:run-123',
            value: expect.objectContaining({
              status: 'completed',
              output: { result: 'success' },
            }),
          }),
        ])
      );
    });

    it('should throw if run does not exist', async () => {
      mockStateGet.mockResolvedValueOnce(null);

      await expect(storage.updateRun('non-existent', { status: 'completed' })).rejects.toThrow(
        'Run not found: non-existent'
      );
    });
  });

  describe('createStep', () => {
    it('should create a step and update index', async () => {
      const step: Step = {
        id: 'step-1',
        runId: 'run-123',
        stepName: 'processData',
        status: 'pending',
        attempts: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockStateGet.mockResolvedValueOnce([]); // steps index
      mockStateSave.mockResolvedValue(undefined);

      await storage.createStep(step);

      expect(mockStateSave).toHaveBeenCalledWith('test-statestore', [
        { key: 'workflow:step:run-123:step-1', value: step },
        { key: 'workflow:steps:index:run-123', value: ['step-1'] },
      ]);
    });

    it('should create cache mapping if cacheKey provided', async () => {
      const step: Step = {
        id: 'step-1',
        runId: 'run-123',
        stepName: 'processData',
        status: 'completed',
        attempts: 1,
        cacheKey: 'cache-key-abc',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockStateGet.mockResolvedValueOnce([]); // steps index
      mockStateSave.mockResolvedValue(undefined);

      await storage.createStep(step);

      expect(mockStateSave).toHaveBeenCalledWith(
        'test-statestore',
        expect.arrayContaining([
          expect.objectContaining({
            key: 'workflow:cache:cache-key-abc',
            value: { runId: 'run-123', stepId: 'step-1' },
          }),
        ])
      );
    });
  });

  describe('getStepByCacheKey', () => {
    it('should return step via cache lookup', async () => {
      const step: Step = {
        id: 'step-1',
        runId: 'run-123',
        stepName: 'processData',
        status: 'completed',
        attempts: 1,
        cacheKey: 'cache-key-abc',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockStateGet
        .mockResolvedValueOnce({ runId: 'run-123', stepId: 'step-1' }) // cache lookup
        .mockResolvedValueOnce(step); // step lookup

      const result = await storage.getStepByCacheKey('cache-key-abc');

      expect(result).toEqual(step);
    });

    it('should return null if cache key not found', async () => {
      mockStateGet.mockResolvedValueOnce(null);

      const result = await storage.getStepByCacheKey('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('createHook', () => {
    it('should create a hook', async () => {
      const hook: Hook = {
        token: 'hook-token-xyz',
        runId: 'run-123',
        stepId: 'step-1',
        createdAt: new Date().toISOString(),
        invoked: false,
      };

      mockStateSave.mockResolvedValueOnce(undefined);

      await storage.createHook(hook);

      expect(mockStateSave).toHaveBeenCalledWith('test-statestore', [
        { key: 'workflow:hook:hook-token-xyz', value: hook },
      ]);
    });
  });

  describe('getHook', () => {
    it('should return hook if exists', async () => {
      const hook: Hook = {
        token: 'hook-token-xyz',
        runId: 'run-123',
        stepId: 'step-1',
        createdAt: new Date().toISOString(),
        invoked: false,
      };

      mockStateGet.mockResolvedValueOnce(hook);

      const result = await storage.getHook('hook-token-xyz');

      expect(result).toEqual(hook);
    });
  });
});
