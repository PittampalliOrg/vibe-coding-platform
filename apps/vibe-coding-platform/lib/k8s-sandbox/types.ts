/**
 * Kubernetes Sandbox Types
 *
 * Defines interfaces that match the @vercel/sandbox API surface
 * for drop-in replacement with K8s-native sandbox execution.
 */

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for creating a new sandbox
 */
export interface SandboxConfig {
  /**
   * Maximum time in milliseconds the sandbox will remain active.
   * Minimum: 600000ms (10 minutes), Maximum: 2700000ms (45 minutes)
   * Default: 600000ms (10 minutes)
   */
  timeout?: number

  /**
   * Array of network ports to expose (max 2).
   * Common ports: 3000 (Next.js), 8000 (Python), 5000 (Flask)
   */
  ports?: number[]
}

/**
 * Resolved sandbox configuration with defaults applied
 */
export interface ResolvedSandboxConfig {
  timeout: number
  ports: number[]
  namespace: string
  template: string
  ingressDomain: string
}

// ============================================================================
// Sandbox Interface (matches @vercel/sandbox)
// ============================================================================

/**
 * Sandbox status states
 */
export type SandboxStatus = 'pending' | 'ready' | 'running' | 'terminated' | 'error'

/**
 * K8s Sandbox instance - matches @vercel/sandbox Sandbox interface
 */
export interface K8sSandbox {
  /**
   * Unique sandbox identifier (e.g., 'sbx-abc123xyz')
   */
  readonly sandboxId: string

  /**
   * Kubernetes pod name
   */
  readonly podName: string

  /**
   * Pod IP address for internal communication
   */
  readonly podIP: string

  /**
   * Current sandbox status
   */
  readonly status: SandboxStatus

  /**
   * Get the public URL for an exposed port.
   * Returns URL pattern: https://{sandboxId}-{port}.sandbox.cnoe.localtest.me:8443
   */
  domain(port: number): string

  /**
   * Read a file from the sandbox filesystem.
   * Returns null if file doesn't exist.
   */
  readFile(path: string): Promise<AsyncIterable<Buffer> | null>

  /**
   * Write multiple files to the sandbox filesystem
   */
  writeFiles(files: Array<{ path: string; content: Buffer }>): Promise<void>

  /**
   * Execute a command in the sandbox
   */
  runCommand(params: RunCommandParams): Promise<Command>

  /**
   * Get a previously started command by ID
   */
  getCommand(cmdId: string): Promise<Command>

  /**
   * Stop the sandbox and cleanup resources
   */
  stop(): Promise<void>
}

// ============================================================================
// Command Execution Types
// ============================================================================

/**
 * Parameters for running a command
 */
export interface RunCommandParams {
  /**
   * The base command to run (e.g., 'npm', 'node', 'python')
   */
  cmd: string

  /**
   * Array of arguments for the command
   */
  args?: string[]

  /**
   * Whether to run with sudo privileges
   */
  sudo?: boolean

  /**
   * Run command in detached mode (background)
   * When true, command runs in background and logs can be streamed
   */
  detached?: boolean
}

/**
 * Log entry from command output
 */
export interface LogEntry {
  /**
   * Log line content
   */
  data: string

  /**
   * Output stream: 'stdout' or 'stderr'
   */
  stream: 'stdout' | 'stderr'

  /**
   * Unix timestamp when the log was captured
   */
  timestamp: number
}

/**
 * Command instance - matches @vercel/sandbox Command interface
 */
export interface Command {
  /**
   * Unique command identifier
   */
  readonly cmdId: string

  /**
   * ISO timestamp when the command started
   */
  readonly startedAt: string

  /**
   * Exit code (null if still running)
   */
  exitCode: number | null

  /**
   * Get all stdout output
   */
  stdout(): Promise<string>

  /**
   * Get all stderr output
   */
  stderr(): Promise<string>

  /**
   * Stream logs as they arrive
   */
  logs(): AsyncIterable<LogEntry>

  /**
   * Wait for command to complete
   * Returns the command instance with exit code populated
   */
  wait(): Promise<Command>
}

// ============================================================================
// Kubernetes Resource Types
// ============================================================================

/**
 * SandboxClaim Custom Resource spec
 */
export interface SandboxClaimSpec {
  /**
   * Name of the SandboxTemplate to use
   */
  template: string

  /**
   * Timeout in seconds
   */
  timeoutSeconds: number

  /**
   * Ports to expose
   */
  ports: number[]

  /**
   * Resource requests/limits
   */
  resources?: {
    requests?: {
      cpu?: string
      memory?: string
    }
    limits?: {
      cpu?: string
      memory?: string
    }
  }
}

/**
 * SandboxClaim status from Kubernetes
 */
export interface SandboxClaimStatus {
  /**
   * Phase: Pending, Allocated, Running, Terminated
   */
  phase: string

  /**
   * Name of the allocated sandbox pod
   */
  podName?: string

  /**
   * IP address of the pod
   */
  podIP?: string

  /**
   * Dapr app ID for service invocation
   */
  daprAppId?: string

  /**
   * Error message if allocation failed
   */
  errorMessage?: string
}

/**
 * Complete SandboxClaim resource
 */
export interface SandboxClaim {
  apiVersion: string
  kind: string
  metadata: {
    name: string
    namespace: string
    labels?: Record<string, string>
    annotations?: Record<string, string>
  }
  spec: SandboxClaimSpec
  status?: SandboxClaimStatus
}

// ============================================================================
// State Store Types (for Dapr state)
// ============================================================================

/**
 * Sandbox state stored in Dapr state store
 */
export interface SandboxState {
  sandboxId: string
  podName: string
  podIP: string
  daprAppId: string
  status: SandboxStatus
  ports: number[]
  createdAt: number
  timeout: number
  namespace: string
}

/**
 * Command state stored in Dapr state store
 */
export interface CommandState {
  cmdId: string
  sandboxId: string
  command: string
  args: string[]
  startedAt: string
  exitCode: number | null
  stdout: string
  stderr: string
  completed: boolean
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Sandbox-specific error with structured data
 */
export class SandboxError extends Error {
  constructor(
    message: string,
    public readonly code: SandboxErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'SandboxError'
  }

  /**
   * Create JSON representation matching @vercel/sandbox APIError format
   */
  get json() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    }
  }
}

/**
 * Error codes for sandbox operations
 */
export type SandboxErrorCode =
  | 'sandbox_not_found'
  | 'sandbox_stopped'
  | 'sandbox_creation_failed'
  | 'sandbox_timeout'
  | 'command_not_found'
  | 'command_execution_failed'
  | 'file_not_found'
  | 'file_write_failed'
  | 'kubernetes_error'
  | 'dapr_error'
  | 'invalid_config'

// ============================================================================
// Environment Configuration
// ============================================================================

/**
 * Environment variable configuration for K8s sandbox
 */
export interface K8sSandboxEnvConfig {
  /**
   * Kubernetes namespace for sandboxes
   * Default: 'agent-sandbox'
   */
  SANDBOX_NAMESPACE: string

  /**
   * SandboxTemplate name
   * Default: 'vibe-coding-sandbox'
   */
  SANDBOX_TEMPLATE: string

  /**
   * Ingress domain for sandbox URLs
   * Default: 'sandbox.cnoe.localtest.me'
   */
  SANDBOX_INGRESS_DOMAIN: string

  /**
   * Ingress port (for HTTPS)
   * Default: '8443'
   */
  SANDBOX_INGRESS_PORT: string

  /**
   * Dapr state store name for sandbox state
   * Default: 'sandbox-statestore'
   */
  SANDBOX_STATE_STORE: string

  /**
   * Dapr HTTP port
   * Default: '3500'
   */
  DAPR_HTTP_PORT: string

  /**
   * Dapr host
   * Default: '127.0.0.1'
   */
  DAPR_HOST: string
}

/**
 * Get configuration from environment with defaults
 */
export function getEnvConfig(): K8sSandboxEnvConfig {
  return {
    SANDBOX_NAMESPACE: process.env.SANDBOX_NAMESPACE ?? 'agent-sandbox',
    SANDBOX_TEMPLATE: process.env.SANDBOX_TEMPLATE ?? 'vibe-coding-sandbox',
    SANDBOX_INGRESS_DOMAIN: process.env.SANDBOX_INGRESS_DOMAIN ?? 'sandbox.cnoe.localtest.me',
    SANDBOX_INGRESS_PORT: process.env.SANDBOX_INGRESS_PORT ?? '8443',
    SANDBOX_STATE_STORE: process.env.SANDBOX_STATE_STORE ?? 'sandbox-statestore',
    DAPR_HTTP_PORT: process.env.DAPR_HTTP_PORT ?? '3500',
    DAPR_HOST: process.env.DAPR_HOST ?? '127.0.0.1',
  }
}
