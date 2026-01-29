/**
 * Sandbox Manager
 *
 * High-level orchestration for K8s sandbox lifecycle management.
 * Provides an interface compatible with @vercel/sandbox.
 */

import { nanoid } from 'nanoid'
import { getK8sClient, K8sClient } from './k8s-client'
import { getDaprClient, DaprClient } from './dapr-client'
import {
  type K8sSandbox,
  type SandboxConfig,
  type SandboxState,
  type SandboxStatus,
  type Command,
  type CommandState,
  type RunCommandParams,
  type LogEntry,
  SandboxError,
  getEnvConfig,
} from './types'

/**
 * Default sandbox configuration
 */
const DEFAULT_CONFIG: Required<SandboxConfig> = {
  timeout: 600000, // 10 minutes
  ports: [3000],
}

/**
 * Command implementation
 */
class K8sCommand implements Command {
  readonly cmdId: string
  readonly startedAt: string
  private _exitCode: number | null = null
  private daprClient: DaprClient
  private daprAppId: string
  private sandboxId: string

  constructor(
    cmdId: string,
    startedAt: string,
    daprAppId: string,
    sandboxId: string,
    daprClient: DaprClient
  ) {
    this.cmdId = cmdId
    this.startedAt = startedAt
    this.daprAppId = daprAppId
    this.sandboxId = sandboxId
    this.daprClient = daprClient
  }

  get exitCode(): number | null {
    return this._exitCode
  }

  async stdout(): Promise<string> {
    const output = await this.daprClient.invokeGetOutput(this.daprAppId, this.cmdId)
    return output.stdout
  }

  async stderr(): Promise<string> {
    const output = await this.daprClient.invokeGetOutput(this.daprAppId, this.cmdId)
    return output.stderr
  }

  async *logs(): AsyncIterable<LogEntry> {
    yield* this.daprClient.invokeStreamLogs(this.daprAppId, this.cmdId)
  }

  async wait(): Promise<Command> {
    // Poll for command completion
    const startTime = Date.now()
    const timeout = 300000 // 5 minute max wait

    while (true) {
      if (Date.now() - startTime > timeout) {
        throw new SandboxError(
          `Timeout waiting for command ${this.cmdId}`,
          'sandbox_timeout',
          { cmdId: this.cmdId }
        )
      }

      const status = await this.daprClient.invokeGetCommand(this.daprAppId, this.cmdId)

      if (status.completed) {
        this._exitCode = status.exitCode
        return this
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
}

/**
 * K8s Sandbox implementation
 */
class K8sSandboxImpl implements K8sSandbox {
  readonly sandboxId: string
  readonly podName: string
  readonly podIP: string
  readonly status: SandboxStatus

  private daprAppId: string
  private daprClient: DaprClient
  private k8sClient: K8sClient
  private config = getEnvConfig()

  constructor(state: SandboxState, daprClient: DaprClient, k8sClient: K8sClient) {
    this.sandboxId = state.sandboxId
    this.podName = state.podName
    this.podIP = state.podIP
    this.daprAppId = state.daprAppId
    this.status = state.status
    this.daprClient = daprClient
    this.k8sClient = k8sClient
  }

  /**
   * Get the public URL for an exposed port
   */
  domain(port: number): string {
    const domain = this.config.SANDBOX_INGRESS_DOMAIN
    const ingressPort = this.config.SANDBOX_INGRESS_PORT
    return `https://${this.sandboxId}-${port}.${domain}:${ingressPort}`
  }

  /**
   * Read a file from the sandbox
   */
  async readFile(path: string): Promise<AsyncIterable<Buffer> | null> {
    const content = await this.daprClient.invokeReadFile(this.daprAppId, path)

    if (!content) {
      return null
    }

    // Return async iterable that yields the content as a single chunk
    const buffer = Buffer.from(content, 'base64')
    return (async function* () {
      yield buffer
    })()
  }

  /**
   * Write files to the sandbox
   */
  async writeFiles(files: Array<{ path: string; content: Buffer }>): Promise<void> {
    const encodedFiles = files.map((f) => ({
      path: f.path,
      content: f.content.toString('base64'),
    }))

    await this.daprClient.invokeWriteFiles(this.daprAppId, encodedFiles)
  }

  /**
   * Run a command in the sandbox
   */
  async runCommand(params: RunCommandParams): Promise<Command> {
    const result = await this.daprClient.invokeExec(this.daprAppId, {
      cmd: params.cmd,
      args: params.args ?? [],
      sudo: params.sudo,
      detached: params.detached,
    })

    return new K8sCommand(
      result.cmdId,
      result.startedAt,
      this.daprAppId,
      this.sandboxId,
      this.daprClient
    )
  }

  /**
   * Get a previously started command
   */
  async getCommand(cmdId: string): Promise<Command> {
    const status = await this.daprClient.invokeGetCommand(this.daprAppId, cmdId)

    return new K8sCommand(
      status.cmdId,
      status.startedAt,
      this.daprAppId,
      this.sandboxId,
      this.daprClient
    )
  }

  /**
   * Stop the sandbox
   */
  async stop(): Promise<void> {
    // Delete the SandboxClaim - controller will clean up the pod
    await this.k8sClient.deleteSandboxClaim(this.sandboxId)

    // Clean up state
    await this.daprClient.deleteSandboxState(this.sandboxId)
  }
}

/**
 * Sandbox Manager - main entry point for sandbox operations
 */
export class SandboxManager {
  private k8sClient: K8sClient
  private daprClient: DaprClient
  private config = getEnvConfig()

  constructor() {
    this.k8sClient = getK8sClient()
    this.daprClient = getDaprClient()
  }

  /**
   * Create a new sandbox
   */
  async create(config?: SandboxConfig): Promise<K8sSandbox> {
    const sandboxId = `sbx-${nanoid(8)}`
    const timeout = config?.timeout ?? DEFAULT_CONFIG.timeout
    const ports = config?.ports ?? DEFAULT_CONFIG.ports

    // Validate config
    if (timeout < 600000 || timeout > 2700000) {
      throw new SandboxError(
        'Timeout must be between 600000ms (10 min) and 2700000ms (45 min)',
        'invalid_config',
        { timeout }
      )
    }

    if (ports.length > 2) {
      throw new SandboxError(
        'Maximum 2 ports can be exposed',
        'invalid_config',
        { ports }
      )
    }

    // Create SandboxClaim CR
    await this.k8sClient.createSandboxClaim({
      name: sandboxId,
      timeoutSeconds: Math.floor(timeout / 1000),
      ports,
    })

    // Wait for sandbox to be ready
    const status = await this.k8sClient.waitForSandboxReady(sandboxId)

    if (!status.podName || !status.podIP || !status.daprAppId) {
      throw new SandboxError(
        'Sandbox allocation incomplete',
        'sandbox_creation_failed',
        { status }
      )
    }

    // Store sandbox state
    const state: SandboxState = {
      sandboxId,
      podName: status.podName,
      podIP: status.podIP,
      daprAppId: status.daprAppId,
      status: 'running',
      ports,
      createdAt: Date.now(),
      timeout,
      namespace: this.config.SANDBOX_NAMESPACE,
    }

    await this.daprClient.saveSandboxState(sandboxId, state)

    return new K8sSandboxImpl(state, this.daprClient, this.k8sClient)
  }

  /**
   * Get an existing sandbox by ID
   */
  async get(params: { sandboxId: string }): Promise<K8sSandbox> {
    const { sandboxId } = params

    // First check state store for cached info
    let state = await this.daprClient.getSandboxState(sandboxId)

    if (!state) {
      // Try to get from K8s directly
      const claim = await this.k8sClient.getSandboxClaim(sandboxId)

      if (!claim) {
        throw new SandboxError(
          `Sandbox ${sandboxId} not found`,
          'sandbox_not_found',
          { sandboxId }
        )
      }

      const claimStatus = claim.status

      if (claimStatus?.phase === 'Terminated') {
        throw new SandboxError(
          `Sandbox ${sandboxId} has been stopped`,
          'sandbox_stopped',
          { sandboxId }
        )
      }

      if (!claimStatus?.podName || !claimStatus?.podIP || !claimStatus?.daprAppId) {
        throw new SandboxError(
          `Sandbox ${sandboxId} is not ready`,
          'sandbox_not_found',
          { sandboxId, phase: claimStatus?.phase }
        )
      }

      // Reconstruct state
      state = {
        sandboxId,
        podName: claimStatus.podName,
        podIP: claimStatus.podIP,
        daprAppId: claimStatus.daprAppId,
        status: claimStatus.phase === 'Running' ? 'running' : 'pending',
        ports: claim.spec.ports,
        createdAt: Date.now(),
        timeout: claim.spec.timeoutSeconds * 1000,
        namespace: claim.metadata.namespace,
      }

      // Cache it
      await this.daprClient.saveSandboxState(sandboxId, state)
    }

    // Verify sandbox is still running
    if (state.status === 'terminated') {
      throw new SandboxError(
        `Sandbox ${sandboxId} has been stopped`,
        'sandbox_stopped',
        { sandboxId }
      )
    }

    // Check pod health
    const isHealthy = await this.daprClient.invokeHealthCheck(state.daprAppId)

    if (!isHealthy) {
      // Update state to terminated
      state.status = 'terminated'
      await this.daprClient.saveSandboxState(sandboxId, state)

      throw new SandboxError(
        `Sandbox ${sandboxId} has been stopped`,
        'sandbox_stopped',
        { sandboxId }
      )
    }

    return new K8sSandboxImpl(state, this.daprClient, this.k8sClient)
  }

  /**
   * List all active sandboxes
   */
  async list(): Promise<K8sSandbox[]> {
    const claims = await this.k8sClient.listSandboxClaims()

    const sandboxes: K8sSandbox[] = []

    for (const claim of claims) {
      const status = claim.status

      if (
        status?.phase === 'Running' &&
        status.podName &&
        status.podIP &&
        status.daprAppId
      ) {
        const state: SandboxState = {
          sandboxId: claim.metadata.name,
          podName: status.podName,
          podIP: status.podIP,
          daprAppId: status.daprAppId,
          status: 'running',
          ports: claim.spec.ports,
          createdAt: Date.now(),
          timeout: claim.spec.timeoutSeconds * 1000,
          namespace: claim.metadata.namespace,
        }

        sandboxes.push(new K8sSandboxImpl(state, this.daprClient, this.k8sClient))
      }
    }

    return sandboxes
  }

  /**
   * Delete all sandboxes (cleanup)
   */
  async deleteAll(): Promise<void> {
    const claims = await this.k8sClient.listSandboxClaims()

    for (const claim of claims) {
      await this.k8sClient.deleteSandboxClaim(claim.metadata.name)
      await this.daprClient.deleteSandboxState(claim.metadata.name)
    }
  }
}

// ============================================================================
// Static Sandbox API (matches @vercel/sandbox)
// ============================================================================

let managerInstance: SandboxManager | null = null

function getManager(): SandboxManager {
  if (!managerInstance) {
    managerInstance = new SandboxManager()
  }
  return managerInstance
}

/**
 * Sandbox class with static methods matching @vercel/sandbox API
 */
export class Sandbox {
  /**
   * Create a new sandbox
   */
  static async create(config?: SandboxConfig): Promise<K8sSandbox> {
    return getManager().create(config)
  }

  /**
   * Get an existing sandbox by ID
   */
  static async get(params: { sandboxId: string }): Promise<K8sSandbox> {
    return getManager().get(params)
  }
}

// Export types for consumers
export type { K8sSandbox, Command, SandboxConfig }
