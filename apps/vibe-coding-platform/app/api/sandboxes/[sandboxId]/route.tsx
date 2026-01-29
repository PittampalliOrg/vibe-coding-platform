import { NextRequest, NextResponse } from 'next/server'
import { Sandbox, SandboxError } from '@/lib/k8s-sandbox'

/**
 * Check sandbox status by running an echo command.
 * Returns the status of the sandbox (running or stopped).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sandboxId: string }> }
) {
  const { sandboxId } = await params
  try {
    const sandbox = await Sandbox.get({ sandboxId })
    await sandbox.runCommand({
      cmd: 'echo',
      args: ['Sandbox status check'],
    })
    return NextResponse.json({ status: 'running' })
  } catch (error) {
    if (
      error instanceof SandboxError &&
      error.code === 'sandbox_stopped'
    ) {
      return NextResponse.json({ status: 'stopped' })
    } else {
      throw error
    }
  }
}
