/**
 * Sandbox Manager
 *
 * High-level orchestration for K8s sandbox lifecycle management.
 * Provides an interface compatible with @vercel/sandbox.
 */

import { customAlphabet } from 'nanoid'

// Custom nanoid with K8s-safe alphabet (lowercase alphanumeric only)
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8)
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
 * Direct command implementation for kubectl exec results
 * Used when sandbox pods don't have Dapr sidecars
 */
class K8sDirectCommand implements Command {
  readonly cmdId: string
  readonly startedAt: string
  private result: { stdout: string; stderr: string; exitCode: number }

  constructor(
    cmdId: string,
    startedAt: string,
    result: { stdout: string; stderr: string; exitCode: number }
  ) {
    this.cmdId = cmdId
    this.startedAt = startedAt
    this.result = result
  }

  get exitCode(): number | null {
    return this.result.exitCode
  }

  async stdout(): Promise<string> {
    return this.result.stdout
  }

  async stderr(): Promise<string> {
    return this.result.stderr
  }

  async *logs(): AsyncIterable<LogEntry> {
    // For direct exec, we just yield stdout/stderr as single entries
    const timestamp = new Date(this.startedAt).getTime()
    if (this.result.stdout) {
      yield { stream: 'stdout' as const, data: this.result.stdout, timestamp }
    }
    if (this.result.stderr) {
      yield { stream: 'stderr' as const, data: this.result.stderr, timestamp }
    }
  }

  async wait(): Promise<Command> {
    // Direct exec is synchronous, so we're already done
    return this
  }
}

/**
 * Command implementation for Dapr-based execution (legacy)
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
   * Uses direct kubectl exec when Dapr is disabled on sandbox pods
   */
  async readFile(path: string): Promise<AsyncIterable<Buffer> | null> {
    // Use direct k8s exec - sandbox pods don't have Dapr sidecars
    const content = await this.k8sClient.readFromPod(this.podName, path, 'sandbox')

    if (!content) {
      return null
    }

    // Return async iterable that yields the content as a single chunk
    return (async function* () {
      yield content
    })()
  }

  /**
   * Write files to the sandbox
   * Uses direct kubectl exec when Dapr is disabled on sandbox pods
   */
  async writeFiles(files: Array<{ path: string; content: Buffer }>): Promise<void> {
    // Use direct k8s exec - sandbox pods don't have Dapr sidecars
    await this.k8sClient.copyToPod(this.podName, files, 'sandbox')
  }

  /**
   * Run a command in the sandbox
   * Uses direct kubectl exec when Dapr is disabled on sandbox pods
   */
  async runCommand(params: RunCommandParams): Promise<Command> {
    const cmdId = `cmd-${nanoid(8)}`
    const startedAt = new Date().toISOString()

    // Build the command array
    const command = [params.cmd, ...(params.args ?? [])]

    // Use direct k8s exec - sandbox pods don't have Dapr sidecars
    const result = await this.k8sClient.execInPod(this.podName, command, 'sandbox')

    // Create a simple command wrapper that stores the result
    return new K8sDirectCommand(cmdId, startedAt, result)
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
    const readyResult = await this.k8sClient.waitForSandboxReady(sandboxId)

    // Use serviceFQDN as daprAppId if available, otherwise derive from sandbox name
    const daprAppId = readyResult.service ?? `sandbox-${sandboxId}`

    // Store sandbox state
    const state: SandboxState = {
      sandboxId,
      podName: readyResult.podName,
      podIP: readyResult.podIP,
      daprAppId,
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
      // Try to get from K8s directly by checking SandboxClaim → Sandbox → Pod
      const claim = await this.k8sClient.getSandboxClaim(sandboxId)

      if (!claim) {
        throw new SandboxError(
          `Sandbox ${sandboxId} not found`,
          'sandbox_not_found',
          { sandboxId }
        )
      }

      // Check if sandbox has been created
      const sandboxName = claim.status?.sandbox?.Name
      if (!sandboxName) {
        throw new SandboxError(
          `Sandbox ${sandboxId} is not ready (no sandbox created yet)`,
          'sandbox_not_found',
          { sandboxId }
        )
      }

      // Get the Sandbox resource
      const sandbox = await this.k8sClient.getSandbox(sandboxName)
      if (!sandbox) {
        throw new SandboxError(
          `Sandbox ${sandboxName} not found`,
          'sandbox_not_found',
          { sandboxId, sandboxName }
        )
      }

      // Check for termination
      const terminatedCondition = sandbox.status?.conditions?.find(
        (c) => c.type === 'Ready' && c.status === 'False' && c.reason === 'Terminated'
      )
      if (terminatedCondition) {
        throw new SandboxError(
          `Sandbox ${sandboxId} has been stopped`,
          'sandbox_stopped',
          { sandboxId }
        )
      }

      // Get pod info using selector
      const selector = sandbox.status?.selector
      if (!selector) {
        throw new SandboxError(
          `Sandbox ${sandboxId} is not ready (no pod selector)`,
          'sandbox_not_found',
          { sandboxId }
        )
      }

      const pods = await this.k8sClient.findPodsBySelector(selector)
      const runningPod = pods.find((p) => p.status?.phase === 'Running' && p.status?.podIP)

      if (!runningPod) {
        throw new SandboxError(
          `Sandbox ${sandboxId} is not ready (pod not running)`,
          'sandbox_not_found',
          { sandboxId }
        )
      }

      // Read ports and timeout from annotations
      const annotations = claim.metadata.annotations ?? {}
      const ports = annotations['sandbox.vibe-coding-platform/ports']
        ? JSON.parse(annotations['sandbox.vibe-coding-platform/ports'])
        : [3000]
      const timeoutSeconds = annotations['sandbox.vibe-coding-platform/timeout-seconds']
        ? parseInt(annotations['sandbox.vibe-coding-platform/timeout-seconds'], 10)
        : 600

      // Reconstruct state
      const daprAppId = sandbox.status?.service ?? `sandbox-${sandboxId}`
      state = {
        sandboxId,
        podName: runningPod.metadata?.name ?? '',
        podIP: runningPod.status?.podIP ?? '',
        daprAppId,
        status: 'running',
        ports,
        createdAt: Date.now(),
        timeout: timeoutSeconds * 1000,
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

    // Check pod health via K8s API instead of Dapr (since Dapr may not be available)
    const isPodRunning = await this.k8sClient.isPodRunning(state.podName)

    if (!isPodRunning) {
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
      try {
        // Check if sandbox reference exists
        const sandboxName = claim.status?.sandbox?.Name
        if (!sandboxName) continue

        // Get the Sandbox resource
        const sandbox = await this.k8sClient.getSandbox(sandboxName)
        if (!sandbox?.status?.selector) continue

        // Find running pod
        const pods = await this.k8sClient.findPodsBySelector(sandbox.status.selector)
        const runningPod = pods.find((p) => p.status?.phase === 'Running' && p.status?.podIP)
        if (!runningPod) continue

        // Read ports and timeout from annotations
        const annotations = claim.metadata.annotations ?? {}
        const ports = annotations['sandbox.vibe-coding-platform/ports']
          ? JSON.parse(annotations['sandbox.vibe-coding-platform/ports'])
          : [3000]
        const timeoutSeconds = annotations['sandbox.vibe-coding-platform/timeout-seconds']
          ? parseInt(annotations['sandbox.vibe-coding-platform/timeout-seconds'], 10)
          : 600

        const daprAppId = sandbox.status?.service ?? `sandbox-${claim.metadata.name}`
        const state: SandboxState = {
          sandboxId: claim.metadata.name,
          podName: runningPod.metadata?.name ?? '',
          podIP: runningPod.status?.podIP ?? '',
          daprAppId,
          status: 'running',
          ports,
          createdAt: Date.now(),
          timeout: timeoutSeconds * 1000,
          namespace: claim.metadata.namespace,
        }

        sandboxes.push(new K8sSandboxImpl(state, this.daprClient, this.k8sClient))
      } catch {
        // Skip sandboxes that fail to load
        continue
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
