/**
 * Dapr Client for Sandbox Pod Communication
 *
 * Uses Dapr service invocation to execute commands in sandbox pods
 * and manages sandbox state in Dapr state store.
 */

import {
  type SandboxState,
  type CommandState,
  type LogEntry,
  SandboxError,
  getEnvConfig,
} from './types'

/**
 * Dapr client for sandbox operations
 */
export class DaprClient {
  private config = getEnvConfig()
  private baseUrl: string

  constructor() {
    const host = this.config.DAPR_HOST
    const port = this.config.DAPR_HTTP_PORT
    this.baseUrl = `http://${host}:${port}`
  }

  // ============================================================================
  // State Store Operations
  // ============================================================================

  /**
   * Save sandbox state to Dapr state store
   */
  async saveSandboxState(sandboxId: string, state: SandboxState): Promise<void> {
    const storeName = this.config.SANDBOX_STATE_STORE
    const key = `sandbox:${sandboxId}`

    try {
      const response = await fetch(`${this.baseUrl}/v1.0/state/${storeName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ key, value: state }]),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to save state: ${error}`)
      }
    } catch (error) {
      throw new SandboxError(
        `Failed to save sandbox state: ${(error as Error).message}`,
        'dapr_error',
        { sandboxId }
      )
    }
  }

  /**
   * Get sandbox state from Dapr state store
   */
  async getSandboxState(sandboxId: string): Promise<SandboxState | null> {
    const storeName = this.config.SANDBOX_STATE_STORE
    const key = `sandbox:${sandboxId}`

    try {
      const response = await fetch(`${this.baseUrl}/v1.0/state/${storeName}/${key}`)

      if (response.status === 204 || response.status === 404) {
        return null
      }

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to get state: ${error}`)
      }

      return await response.json()
    } catch (error) {
      if ((error as Error).message.includes('Failed to get state')) {
        throw new SandboxError(
          `Failed to get sandbox state: ${(error as Error).message}`,
          'dapr_error',
          { sandboxId }
        )
      }
      return null
    }
  }

  /**
   * Delete sandbox state from Dapr state store
   */
  async deleteSandboxState(sandboxId: string): Promise<void> {
    const storeName = this.config.SANDBOX_STATE_STORE
    const key = `sandbox:${sandboxId}`

    try {
      const response = await fetch(`${this.baseUrl}/v1.0/state/${storeName}/${key}`, {
        method: 'DELETE',
      })

      if (!response.ok && response.status !== 404) {
        const error = await response.text()
        throw new Error(`Failed to delete state: ${error}`)
      }
    } catch (error) {
      throw new SandboxError(
        `Failed to delete sandbox state: ${(error as Error).message}`,
        'dapr_error',
        { sandboxId }
      )
    }
  }

  /**
   * Save command state to Dapr state store
   */
  async saveCommandState(sandboxId: string, cmdId: string, state: CommandState): Promise<void> {
    const storeName = this.config.SANDBOX_STATE_STORE
    const key = `command:${sandboxId}:${cmdId}`

    try {
      const response = await fetch(`${this.baseUrl}/v1.0/state/${storeName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ key, value: state }]),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to save command state: ${error}`)
      }
    } catch (error) {
      throw new SandboxError(
        `Failed to save command state: ${(error as Error).message}`,
        'dapr_error',
        { sandboxId, cmdId }
      )
    }
  }

  /**
   * Get command state from Dapr state store
   */
  async getCommandState(sandboxId: string, cmdId: string): Promise<CommandState | null> {
    const storeName = this.config.SANDBOX_STATE_STORE
    const key = `command:${sandboxId}:${cmdId}`

    try {
      const response = await fetch(`${this.baseUrl}/v1.0/state/${storeName}/${key}`)

      if (response.status === 204 || response.status === 404) {
        return null
      }

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to get command state: ${error}`)
      }

      return await response.json()
    } catch (error) {
      if ((error as Error).message.includes('Failed to get')) {
        throw new SandboxError(
          `Failed to get command state: ${(error as Error).message}`,
          'dapr_error',
          { sandboxId, cmdId }
        )
      }
      return null
    }
  }

  // ============================================================================
  // Service Invocation Operations
  // ============================================================================

  /**
   * Execute a command in a sandbox pod via Dapr service invocation
   */
  async invokeExec(
    daprAppId: string,
    params: {
      cmd: string
      args: string[]
      sudo?: boolean
      detached?: boolean
    }
  ): Promise<{
    cmdId: string
    startedAt: string
    exitCode: number | null
    stdout?: string
    stderr?: string
  }> {
    try {
      const response = await fetch(
        `${this.baseUrl}/v1.0/invoke/${daprAppId}/method/exec`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        }
      )

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Exec failed: ${error}`)
      }

      return await response.json()
    } catch (error) {
      throw new SandboxError(
        `Failed to execute command: ${(error as Error).message}`,
        'command_execution_failed',
        { daprAppId, cmd: params.cmd }
      )
    }
  }

  /**
   * Get command status from sandbox pod
   */
  async invokeGetCommand(
    daprAppId: string,
    cmdId: string
  ): Promise<{
    cmdId: string
    startedAt: string
    exitCode: number | null
    completed: boolean
  }> {
    try {
      const response = await fetch(
        `${this.baseUrl}/v1.0/invoke/${daprAppId}/method/command/${cmdId}`,
        { method: 'GET' }
      )

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Get command failed: ${error}`)
      }

      return await response.json()
    } catch (error) {
      throw new SandboxError(
        `Failed to get command: ${(error as Error).message}`,
        'command_not_found',
        { daprAppId, cmdId }
      )
    }
  }

  /**
   * Get command output from sandbox pod
   */
  async invokeGetOutput(
    daprAppId: string,
    cmdId: string
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      const response = await fetch(
        `${this.baseUrl}/v1.0/invoke/${daprAppId}/method/command/${cmdId}/output`,
        { method: 'GET' }
      )

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Get output failed: ${error}`)
      }

      return await response.json()
    } catch (error) {
      throw new SandboxError(
        `Failed to get command output: ${(error as Error).message}`,
        'command_not_found',
        { daprAppId, cmdId }
      )
    }
  }

  /**
   * Stream command logs from sandbox pod
   * Returns an async generator of log entries
   */
  async *invokeStreamLogs(
    daprAppId: string,
    cmdId: string
  ): AsyncGenerator<LogEntry> {
    try {
      const response = await fetch(
        `${this.baseUrl}/v1.0/invoke/${daprAppId}/method/command/${cmdId}/logs`,
        { method: 'GET' }
      )

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Stream logs failed: ${error}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          // Process any remaining data in buffer
          if (buffer.trim()) {
            try {
              yield JSON.parse(buffer)
            } catch {
              // Ignore parse errors for incomplete data
            }
          }
          break
        }

        buffer += decoder.decode(value, { stream: true })

        // Process complete NDJSON lines
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              yield JSON.parse(line)
            } catch {
              // Skip invalid JSON lines
            }
          }
        }
      }
    } catch (error) {
      throw new SandboxError(
        `Failed to stream logs: ${(error as Error).message}`,
        'command_not_found',
        { daprAppId, cmdId }
      )
    }
  }

  /**
   * Write files to sandbox pod via Dapr service invocation
   */
  async invokeWriteFiles(
    daprAppId: string,
    files: Array<{ path: string; content: string }> // base64 encoded content
  ): Promise<void> {
    try {
      const response = await fetch(
        `${this.baseUrl}/v1.0/invoke/${daprAppId}/method/files`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files }),
        }
      )

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Write files failed: ${error}`)
      }
    } catch (error) {
      throw new SandboxError(
        `Failed to write files: ${(error as Error).message}`,
        'file_write_failed',
        { daprAppId, fileCount: files.length }
      )
    }
  }

  /**
   * Read a file from sandbox pod via Dapr service invocation
   */
  async invokeReadFile(
    daprAppId: string,
    path: string
  ): Promise<string | null> {
    // Returns base64 encoded content
    try {
      const response = await fetch(
        `${this.baseUrl}/v1.0/invoke/${daprAppId}/method/files?path=${encodeURIComponent(path)}`,
        { method: 'GET' }
      )

      if (response.status === 404) {
        return null
      }

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Read file failed: ${error}`)
      }

      const data = await response.json()
      return data.content // base64 encoded
    } catch (error) {
      if ((error as Error).message.includes('Read file failed')) {
        throw new SandboxError(
          `Failed to read file: ${(error as Error).message}`,
          'file_not_found',
          { daprAppId, path }
        )
      }
      return null
    }
  }

  /**
   * Health check for sandbox pod
   */
  async invokeHealthCheck(daprAppId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/v1.0/invoke/${daprAppId}/method/health`,
        { method: 'GET' }
      )
      return response.ok
    } catch {
      return false
    }
  }
}

// Singleton instance
let daprClientInstance: DaprClient | null = null

/**
 * Get or create the Dapr client singleton
 */
export function getDaprClient(): DaprClient {
  if (!daprClientInstance) {
    daprClientInstance = new DaprClient()
  }
  return daprClientInstance
}
