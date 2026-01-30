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
  type SandboxResource,
  SandboxError,
  getEnvConfig,
} from './types'

// Custom Resource API group and version for SandboxClaim (extensions)
const SANDBOX_CLAIM_API_GROUP = 'extensions.agents.x-k8s.io'
const SANDBOX_CLAIM_API_VERSION = 'v1alpha1'
const SANDBOX_CLAIM_PLURAL = 'sandboxclaims'

// Custom Resource API group and version for Sandbox (core)
const SANDBOX_API_GROUP = 'agents.x-k8s.io'
const SANDBOX_API_VERSION = 'v1alpha1'
const SANDBOX_PLURAL = 'sandboxes'

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

    // Ensure the name is valid for K8s (lowercase alphanumeric + dashes only)
    const safeName = params.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')

    const sandboxClaim: SandboxClaim = {
      apiVersion: `${SANDBOX_CLAIM_API_GROUP}/${SANDBOX_CLAIM_API_VERSION}`,
      kind: 'SandboxClaim',
      metadata: {
        name: safeName,
        namespace,
        labels: {
          'app.kubernetes.io/managed-by': 'vibe-coding-platform',
          'sandbox.vibe-coding-platform/id': safeName,
        },
        annotations: {
          'sandbox.vibe-coding-platform/created-at': new Date().toISOString(),
          // Store timeout and ports in annotations since CRD doesn't have these fields
          'sandbox.vibe-coding-platform/timeout-seconds': String(params.timeoutSeconds),
          'sandbox.vibe-coding-platform/ports': JSON.stringify(params.ports),
        },
      },
      spec: {
        // SandboxClaim CRD only has sandboxTemplateRef field
        sandboxTemplateRef: {
          name: template,
        },
      },
    }

    try {
      const response = await this.customApi.createNamespacedCustomObject({
        group: SANDBOX_CLAIM_API_GROUP,
        version: SANDBOX_CLAIM_API_VERSION,
        namespace,
        plural: SANDBOX_CLAIM_PLURAL,
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
        group: SANDBOX_CLAIM_API_GROUP,
        version: SANDBOX_CLAIM_API_VERSION,
        namespace,
        plural: SANDBOX_CLAIM_PLURAL,
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
   * Get a Sandbox resource by name
   */
  async getSandbox(name: string): Promise<SandboxResource | null> {
    const namespace = this.config.SANDBOX_NAMESPACE

    try {
      const response = await this.customApi.getNamespacedCustomObject({
        group: SANDBOX_API_GROUP,
        version: SANDBOX_API_VERSION,
        namespace,
        plural: SANDBOX_PLURAL,
        name,
      })

      return response as unknown as SandboxResource
    } catch (error) {
      const { statusCode, message } = getK8sErrorDetails(error)
      if (statusCode === 404) {
        return null
      }
      throw new SandboxError(
        `Failed to get Sandbox: ${message}`,
        'kubernetes_error',
        { error }
      )
    }
  }

  /**
   * Find pods by label selector
   */
  async findPodsBySelector(selector: string): Promise<k8s.V1Pod[]> {
    const namespace = this.config.SANDBOX_NAMESPACE

    try {
      const response = await this.coreApi.listNamespacedPod({
        namespace,
        labelSelector: selector,
      })
      return response.items
    } catch (error) {
      const { message } = getK8sErrorDetails(error)
      throw new SandboxError(
        `Failed to find pods: ${message}`,
        'kubernetes_error',
        { error }
      )
    }
  }

  /**
   * Wait for a SandboxClaim to be ready (pod allocated and running)
   *
   * Flow:
   * 1. Wait for SandboxClaim to have status.sandbox.Name
   * 2. Get the Sandbox and wait for it to be ready
   * 3. Find pod using selector and get its IP
   */
  async waitForSandboxReady(
    name: string,
    timeoutMs: number = 120000
  ): Promise<{ sandboxName: string; podName: string; podIP: string; serviceFQDN?: string; service?: string }> {
    const startTime = Date.now()

    const checkTimeout = () => {
      if (Date.now() - startTime > timeoutMs) {
        throw new SandboxError(
          `Timeout waiting for sandbox ${name} to be ready`,
          'sandbox_timeout',
          { timeoutMs, elapsed: Date.now() - startTime }
        )
      }
    }

    // Step 1: Wait for SandboxClaim to have sandbox reference
    let sandboxName: string | undefined
    while (!sandboxName) {
      checkTimeout()

      const claim = await this.getSandboxClaim(name)
      if (!claim) {
        throw new SandboxError(`SandboxClaim ${name} not found`, 'sandbox_not_found')
      }

      // Check for failure conditions
      const failedCondition = claim.status?.conditions?.find(
        (c) => c.type === 'Ready' && c.status === 'False' && c.reason === 'Failed'
      )
      if (failedCondition) {
        throw new SandboxError(
          `Sandbox ${name} failed: ${failedCondition.message}`,
          'sandbox_creation_failed',
          { condition: failedCondition }
        )
      }

      sandboxName = claim.status?.sandbox?.Name
      if (!sandboxName) {
        await new Promise((r) => setTimeout(r, 1000))
      }
    }

    // Step 2: Wait for Sandbox to be ready
    let selector: string | undefined
    let serviceFQDN: string | undefined
    let service: string | undefined

    while (!selector) {
      checkTimeout()

      const sandbox = await this.getSandbox(sandboxName)
      if (!sandbox) {
        throw new SandboxError(`Sandbox ${sandboxName} not found`, 'sandbox_not_found')
      }

      // Check for ready condition
      const readyCondition = sandbox.status?.conditions?.find((c) => c.type === 'Ready')
      if (readyCondition?.status === 'False' && readyCondition.reason === 'Failed') {
        throw new SandboxError(
          `Sandbox ${sandboxName} failed: ${readyCondition.message}`,
          'sandbox_creation_failed',
          { condition: readyCondition }
        )
      }

      selector = sandbox.status?.selector
      serviceFQDN = sandbox.status?.serviceFQDN
      service = sandbox.status?.service

      if (!selector) {
        await new Promise((r) => setTimeout(r, 1000))
      }
    }

    // Step 3: Find pod using selector and wait for it to be running
    let podName: string | undefined
    let podIP: string | undefined

    while (!podIP) {
      checkTimeout()

      const pods = await this.findPodsBySelector(selector)
      const runningPod = pods.find((p) => p.status?.phase === 'Running' && p.status?.podIP)

      if (runningPod) {
        podName = runningPod.metadata?.name
        podIP = runningPod.status?.podIP
      } else {
        await new Promise((r) => setTimeout(r, 1000))
      }
    }

    return {
      sandboxName,
      podName: podName!,
      podIP,
      serviceFQDN,
      service,
    }
  }

  /**
   * Delete a SandboxClaim
   */
  async deleteSandboxClaim(name: string): Promise<void> {
    const namespace = this.config.SANDBOX_NAMESPACE

    try {
      await this.customApi.deleteNamespacedCustomObject({
        group: SANDBOX_CLAIM_API_GROUP,
        version: SANDBOX_CLAIM_API_VERSION,
        namespace,
        plural: SANDBOX_CLAIM_PLURAL,
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
        group: SANDBOX_CLAIM_API_GROUP,
        version: SANDBOX_CLAIM_API_VERSION,
        namespace,
        plural: SANDBOX_CLAIM_PLURAL,
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
   * Execute a command in a pod using kubectl exec subprocess
   * Uses subprocess to avoid WebSocket/proxy issues with the Kubernetes client
   */
  async execInPod(
    podName: string,
    command: string[],
    container?: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const namespace = this.config.SANDBOX_NAMESPACE
    const { execSync, spawnSync } = await import('child_process')

    const containerArg = container ?? 'sandbox'
    const kubectlArgs = [
      'exec',
      '-n', namespace,
      podName,
      '-c', containerArg,
      '--',
      ...command
    ]

    try {
      const result = spawnSync('kubectl', kubectlArgs, {
        encoding: 'utf-8',
        timeout: 30000, // 30 second timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      })

      return {
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exitCode: result.status ?? 1,
      }
    } catch (error) {
      return {
        stdout: '',
        stderr: (error as Error).message,
        exitCode: 1,
      }
    }
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
