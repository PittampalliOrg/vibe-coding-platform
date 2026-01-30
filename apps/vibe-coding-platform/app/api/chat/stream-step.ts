import { streamText, generateId } from 'ai'
import { UIStreamChunk } from '@/ai/tools/types'
import { getWritable } from 'workflow'
import { createAnthropic } from '@ai-sdk/anthropic'

// Step function that handles the entire streaming call
// Model creation happens inside the step, avoiding serialization issues
export async function streamWithAnthropic(
  nativeModelId: string,
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
) {
  'use step'

  const writable = getWritable<UIStreamChunk>()
  const writer = writable.getWriter()

  // Create the model inside the step function
  const provider = createAnthropic()
  const model = provider(nativeModelId)

  // Write start chunk
  const messageId = generateId()
  await writer.write({ type: 'start', messageId })
  await writer.write({ type: 'start-step' })

  // Use AI SDK's streamText
  const result = streamText({
    model,
    system: systemPrompt,
    messages,
  })

  // Stream the response
  let textId: string | undefined

  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') {
      if (!textId) {
        textId = generateId()
        await writer.write({ type: 'text-start', id: textId })
      }
      await writer.write({ type: 'text-delta', id: textId, delta: part.textDelta })
    }
  }

  if (textId) {
    await writer.write({ type: 'text-end', id: textId })
  }

  await writer.write({ type: 'finish-step' })
  await writer.write({ type: 'finish' })

  writer.releaseLock()
  await writable.close()
}
