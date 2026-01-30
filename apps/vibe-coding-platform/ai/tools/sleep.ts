import { tool } from 'ai'
import description from './sleep.prompt'
import z from 'zod/v3'
import { getWritable } from 'workflow'
import { UIStreamChunk } from './types'

const inputSchema = z.object({
  sleepForMs: z.number().describe('The number of milliseconds to sleep'),
})

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function executeSleep(
  { sleepForMs }: z.infer<typeof inputSchema>,
  { toolCallId }: { toolCallId: string }
) {
  'use step'

  const writable = getWritable<UIStreamChunk>()
  const writer = writable.getWriter()

  const sleepSeconds = Math.ceil(sleepForMs / 1000)

  writer.write({
    id: toolCallId,
    type: 'data-wait',
    data: { text: `Sleeping for ${sleepSeconds} seconds` },
  })

  await delay(sleepForMs)

  return `Slept for ${sleepSeconds} seconds.`
}

export const sleepTool = () =>
  tool({
    description,
    inputSchema,
    execute: (args, options) => executeSleep(args, options),
  })
