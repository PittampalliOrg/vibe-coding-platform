/**
 * K8s Sandbox Module
 *
 * Drop-in replacement for @vercel/sandbox using Kubernetes Agent Sandbox.
 *
 * @example
 * ```typescript
 * import { Sandbox } from '@/lib/k8s-sandbox'
 *
 * // Create a new sandbox
 * const sandbox = await Sandbox.create({
 *   timeout: 600000,
 *   ports: [3000, 8000],
 * })
 *
 * // Run a command
 * const cmd = await sandbox.runCommand({
 *   cmd: 'npm',
 *   args: ['install'],
 * })
 *
 * // Wait for completion
 * await cmd.wait()
 *
 * // Get sandbox URL
 * const url = sandbox.domain(3000)
 * ```
 */

export { Sandbox, SandboxManager } from './sandbox-manager'
export type { K8sSandbox, Command, SandboxConfig } from './sandbox-manager'
export {
  SandboxError,
  type SandboxErrorCode,
  type SandboxStatus,
  type RunCommandParams,
  type LogEntry,
  type SandboxState,
  type CommandState,
  getEnvConfig,
} from './types'
export { getK8sClient, K8sClient } from './k8s-client'
export { getDaprClient, DaprClient } from './dapr-client'
