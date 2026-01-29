/**
 * Kubernetes Client for Sandbox Operations
 *
 * Handles SandboxClaim CR creation, watching, and deletion
 * using the @kubernetes/client-node SDK.
 */

import * as k8s from '@kubernetes/client-node'
import { Writable } from 'stream'
import {
  type SandboxClaim,
  type SandboxClaimStatus,
  SandboxError,
  getEnvConfig,
} from './types'

// Custom Resource API group and version
const SANDBOX_API_GROUP = 'extensions.agents.x-k8s.io'
const SANDBOX_API_VERSION = 'v1alpha1'
const SANDBOX_PLURAL = 'sandboxclaims'

/**
 * Interface for K8s API error responses
 */
interface K8sApiError {
  response?: {
    statusCode?: number
    body?: {
      message?: string
      reason?: string
    }
  }
  statusCode?: number
  message?: string
}

/**
 * Extract error details from K8s API error
 */
function getK8sErrorDetails(error: unknown): { statusCode?: number; message: string } {
  const k8sError = error as K8sApiError
  return {
    statusCode: k8sError.response?.statusCode ?? k8sError.statusCode,
    message:
      k8sError.response?.body?.message ??
      k8sError.message ??
      String(error),
  }
}

/**
 * Kubernetes client for sandbox operations
 */
export class K8sClient {
  private kubeConfig: k8s.KubeConfig
  private coreApi: k8s.CoreV1Api
  private customApi: k8s.CustomObjectsApi
  private config = getEnvConfig()

  constructor() {
    this.kubeConfig = new k8s.KubeConfig()

    // Load config from cluster (when running in K8s) or from default kubeconfig
    if (process.env.KUBERNETES_SERVICE_HOST) {
      this.kubeConfig.loadFromCluster()
    } else {
      this.kubeConfig.loadFromDefault()
    }

    this.coreApi = this.kubeConfig.makeApiClient(k8s.CoreV1Api)
    this.customApi = this.kubeConfig.makeApiClient(k8s.CustomObjectsApi)
  }

  /**
   * Create a new SandboxClaim Custom Resource
   */
  async createSandboxClaim(params: {
    name: string
    template?: string
    timeoutSeconds: number
    ports: number[]
  }): Promise<SandboxClaim> {
    const namespace = this.config.SANDBOX_NAMESPACE
    const template = params.template ?? this.config.SANDBOX_TEMPLATE

    const sandboxClaim: SandboxClaim = {
      apiVersion: `${SANDBOX_API_GROUP}/${SANDBOX_API_VERSION}`,
      kind: 'SandboxClaim',
      metadata: {
        name: params.name,
        namespace,
        labels: {
          'app.kubernetes.io/managed-by': 'vibe-coding-platform',
          'sandbox.vibe-coding-platform/id': params.name,
        },
        annotations: {
          'sandbox.vibe-coding-platform/created-at': new Date().toISOString(),
        },
      },
      spec: {
        template,
        timeoutSeconds: params.timeoutSeconds,
        ports: params.ports,
      },
    }

    try {
      const response = await this.customApi.createNamespacedCustomObject({
        group: SANDBOX_API_GROUP,
        version: SANDBOX_API_VERSION,
        namespace,
        plural: SANDBOX_PLURAL,
        body: sandboxClaim,
      })

      return response as unknown as SandboxClaim
    } catch (error) {
      const { message } = getK8sErrorDetails(error)
      throw new SandboxError(
        `Failed to create SandboxClaim: ${message}`,
        'sandbox_creation_failed',
        { error }
      )
    }
  }

  /**
   * Get a SandboxClaim by name
   */
  async getSandboxClaim(name: string): Promise<SandboxClaim | null> {
    const namespace = this.config.SANDBOX_NAMESPACE

    try {
      const response = await this.customApi.getNamespacedCustomObject({
        group: SANDBOX_API_GROUP,
        version: SANDBOX_API_VERSION,
        namespace,
        plural: SANDBOX_PLURAL,
        name,
      })

      return response as unknown as SandboxClaim
    } catch (error) {
      const { statusCode, message } = getK8sErrorDetails(error)
      if (statusCode === 404) {
        return null
      }
      throw new SandboxError(
        `Failed to get SandboxClaim: ${message}`,
        'kubernetes_error',
        { error }
      )
    }
  }

  /**
   * Wait for a SandboxClaim to be ready (pod allocated and running)
   */
  async waitForSandboxReady(
    name: string,
    timeoutMs: number = 120000
  ): Promise<SandboxClaimStatus> {
    const startTime = Date.now()

    return new Promise((resolve, reject) => {
      const checkStatus = async () => {
        const elapsed = Date.now() - startTime
        if (elapsed > timeoutMs) {
          reject(
            new SandboxError(
              `Timeout waiting for sandbox ${name} to be ready`,
              'sandbox_timeout',
              { timeoutMs, elapsed }
            )
          )
          return
        }

        try {
          const claim = await this.getSandboxClaim(name)

          if (!claim) {
            reject(
              new SandboxError(
                `SandboxClaim ${name} not found`,
                'sandbox_not_found'
              )
            )
            return
          }

          const status = claim.status

          if (status?.phase === 'Running' && status.podIP && status.podName) {
            resolve(status)
            return
          }

          if (status?.phase === 'Failed' || status?.phase === 'Terminated') {
            reject(
              new SandboxError(
                `Sandbox ${name} failed: ${status.errorMessage ?? 'Unknown error'}`,
                'sandbox_creation_failed',
                { phase: status.phase, errorMessage: status.errorMessage }
              )
            )
            return
          }

          // Still pending, check again
          setTimeout(checkStatus, 1000)
        } catch (error) {
          if (error instanceof SandboxError) {
            reject(error)
          } else {
            reject(
              new SandboxError(
                `Error checking sandbox status: ${(error as Error).message}`,
                'kubernetes_error'
              )
            )
          }
        }
      }

      checkStatus()
    })
  }

  /**
   * Delete a SandboxClaim
   */
  async deleteSandboxClaim(name: string): Promise<void> {
    const namespace = this.config.SANDBOX_NAMESPACE

    try {
      await this.customApi.deleteNamespacedCustomObject({
        group: SANDBOX_API_GROUP,
        version: SANDBOX_API_VERSION,
        namespace,
        plural: SANDBOX_PLURAL,
        name,
      })
    } catch (error) {
      const { statusCode, message } = getK8sErrorDetails(error)
      // Ignore 404 - already deleted
      if (statusCode !== 404) {
        throw new SandboxError(
          `Failed to delete SandboxClaim: ${message}`,
          'kubernetes_error',
          { error }
        )
      }
    }
  }

  /**
   * List all SandboxClaims managed by this platform
   */
  async listSandboxClaims(): Promise<SandboxClaim[]> {
    const namespace = this.config.SANDBOX_NAMESPACE

    try {
      const response = await this.customApi.listNamespacedCustomObject({
        group: SANDBOX_API_GROUP,
        version: SANDBOX_API_VERSION,
        namespace,
        plural: SANDBOX_PLURAL,
        labelSelector: 'app.kubernetes.io/managed-by=vibe-coding-platform',
      })

      const list = response as { items: SandboxClaim[] }
      return list.items
    } catch (error) {
      const { message } = getK8sErrorDetails(error)
      throw new SandboxError(
        `Failed to list SandboxClaims: ${message}`,
        'kubernetes_error',
        { error }
      )
    }
  }

  /**
   * Get pod details by name
   */
  async getPod(podName: string): Promise<k8s.V1Pod | null> {
    const namespace = this.config.SANDBOX_NAMESPACE

    try {
      const response = await this.coreApi.readNamespacedPod({
        name: podName,
        namespace,
      })
      return response
    } catch (error) {
      const { statusCode, message } = getK8sErrorDetails(error)
      if (statusCode === 404) {
        return null
      }
      throw new SandboxError(
        `Failed to get pod: ${message}`,
        'kubernetes_error',
        { error }
      )
    }
  }

  /**
   * Check if a pod is running
   */
  async isPodRunning(podName: string): Promise<boolean> {
    const pod = await this.getPod(podName)
    return pod?.status?.phase === 'Running'
  }

  /**
   * Execute a command in a pod using kubectl exec (via Kubernetes API)
   * This is used for simple synchronous commands
   */
  async execInPod(
    podName: string,
    command: string[],
    container?: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const namespace = this.config.SANDBOX_NAMESPACE
    const exec = new k8s.Exec(this.kubeConfig)

    return new Promise((resolve, reject) => {
      let stdout = ''
      let stderr = ''

      const stdoutStream = new Writable({
        write(chunk, _encoding, callback) {
          stdout += chunk.toString()
          callback()
        },
      })

      const stderrStream = new Writable({
        write(chunk, _encoding, callback) {
          stderr += chunk.toString()
          callback()
        },
      })

      exec
        .exec(
          namespace,
          podName,
          container ?? 'sandbox',
          command,
          stdoutStream,
          stderrStream,
          null,
          false,
          (status: k8s.V1Status) => {
            const exitCode = status.status === 'Success' ? 0 : 1
            resolve({ stdout, stderr, exitCode })
          }
        )
        .catch(reject)
    })
  }

  /**
   * Copy files to a pod
   * Uses exec with base64 encoding for safe file transfer
   */
  async copyToPod(
    podName: string,
    files: Array<{ path: string; content: Buffer }>,
    container?: string
  ): Promise<void> {
    // For each file, use base64 encoding to safely transfer file content
    for (const file of files) {
      try {
        // Create directory if needed
        const dir = file.path.substring(0, file.path.lastIndexOf('/'))
        if (dir) {
          await this.execInPod(podName, ['mkdir', '-p', dir], container)
        }

        // Use base64 encoding to safely transfer file content
        const base64Content = file.content.toString('base64')
        await this.execInPod(
          podName,
          ['sh', '-c', `echo '${base64Content}' | base64 -d > '${file.path}'`],
          container
        )
      } catch (error) {
        throw new SandboxError(
          `Failed to copy file ${file.path} to pod: ${(error as Error).message}`,
          'file_write_failed',
          { path: file.path, podName }
        )
      }
    }
  }

  /**
   * Read a file from a pod
   */
  async readFromPod(
    podName: string,
    path: string,
    container?: string
  ): Promise<Buffer | null> {
    try {
      // Check if file exists first
      const checkResult = await this.execInPod(
        podName,
        ['sh', '-c', `test -f '${path}' && echo exists || echo notfound`],
        container
      )

      if (!checkResult.stdout.includes('exists')) {
        return null
      }

      // Read file using base64 to handle binary safely
      const result = await this.execInPod(
        podName,
        ['base64', path],
        container
      )

      if (result.exitCode !== 0) {
        return null
      }

      return Buffer.from(result.stdout.trim(), 'base64')
    } catch (error) {
      throw new SandboxError(
        `Failed to read file ${path} from pod: ${(error as Error).message}`,
        'file_not_found',
        { path, podName }
      )
    }
  }
}

// Singleton instance
let k8sClientInstance: K8sClient | null = null

/**
 * Get or create the K8s client singleton
 */
export function getK8sClient(): K8sClient {
  if (!k8sClientInstance) {
    k8sClientInstance = new K8sClient()
  }
  return k8sClientInstance
}
