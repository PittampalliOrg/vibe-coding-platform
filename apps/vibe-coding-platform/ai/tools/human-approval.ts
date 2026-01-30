import { tool } from 'ai'
import description from './human-approval.prompt'
import z from 'zod/v3'
import { getWritable } from 'workflow'
import { UIStreamChunk } from './types'

const inputSchema = z.object({
  message: z
    .string()
    .optional()
    .describe('Optional message to display to the user requesting approval'),
})

async function executeHumanApproval(
  { message }: z.infer<typeof inputSchema>,
  { toolCallId }: { toolCallId: string }
) {
  'use step'

  const writable = getWritable<UIStreamChunk>()
  const writer = writable.getWriter()

  writer.write({
    id: toolCallId,
    type: 'data-wait',
    data: {
      text: message ?? 'Waiting for human approval...',
    },
  })

  // In workflow mode, this step will be paused and resumed via webhook
  // For now, return immediately with a placeholder response
  return 'Human approval requested. Workflow will resume when approval is received.'
}

export const humanApprovalTool = () =>
  tool({
    description,
    inputSchema,
    execute: (args, options) => executeHumanApproval(args, options),
  })
