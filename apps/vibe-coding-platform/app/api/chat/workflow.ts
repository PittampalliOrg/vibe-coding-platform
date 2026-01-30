import { stepCountIs } from 'ai'
import type { ChatUIMessage } from '@/components/chat/types'
import { Models } from '@/ai/constants'
import prompt from './chat.prompt'
import { UIStreamChunk } from '@/ai/tools/types'
import { getWritable } from 'workflow'
import { DurableAgent } from '@workflow/ai/agent'
import { createAnthropic } from '@ai-sdk/anthropic'

// Map app model IDs to native Anthropic model IDs
const ANTHROPIC_MODELS: Record<string, string> = {
  [Models.AnthropicClaude4Sonnet]: 'claude-sonnet-4-20250514',
  [Models.AnthropicClaude45Haiku]: 'claude-haiku-4-5-20250929',
  [Models.AnthropicClaude45Sonnet]: 'claude-sonnet-4-5-20250929',
}

// Get native model ID from app model ID
function getNativeModelId(modelId: string): string {
  return ANTHROPIC_MODELS[modelId] ?? 'claude-sonnet-4-5-20250929'
}

// Factory function that returns a step-enabled model creator
// Pattern from @workflow/ai: the returned function contains 'use step'
// so the bundler transforms it to be serializable with its captured args
function anthropicModel(nativeModelId: string) {
  return async () => {
    'use step'
    const provider = createAnthropic()
    return provider(nativeModelId)
  }
}

export async function codeWorkflow({
  messages,
  modelId,
}: {
  messages: ChatUIMessage[]
  modelId: string
}) {
  'use workflow'

  const writable = getWritable<UIStreamChunk>()

  // Get native Anthropic model ID
  const nativeModelId = getNativeModelId(modelId)

  // Manually convert UI messages to model messages format
  // (convertToModelMessages doesn't work with deserialized workflow args)
  const modelMessages = messages.map((msg) => {
    const content = msg.parts
      ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('\n') || ''
    return {
      role: msg.role as 'user' | 'assistant',
      content,
    }
  })

  const agent = new DurableAgent({
    // Use our factory function that returns a step-enabled model creator
    model: anthropicModel(nativeModelId),
    system: prompt,
    // TODO: Tools need to be defined per DurableAgent docs format
    // tools: tools({ modelId, messages: modelMessages }),
  })

  await agent.stream({
    messages: modelMessages,
    writable,
    stopWhen: stepCountIs(10),
    sendStart: false,
  })
}
