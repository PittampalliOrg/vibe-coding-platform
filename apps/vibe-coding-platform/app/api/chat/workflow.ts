import type { ChatUIMessage } from '@/components/chat/types'
import { Models } from '@/ai/constants'
import prompt from './chat.prompt'
import { streamWithAnthropic } from './stream-step'

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

export async function codeWorkflow({
  messages,
  modelId,
}: {
  messages: ChatUIMessage[]
  modelId: string
}) {
  'use workflow'

  // Get native Anthropic model ID
  const nativeModelId = getNativeModelId(modelId)

  // Manually convert UI messages to model messages format
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

  // Call our step function that handles everything
  await streamWithAnthropic(nativeModelId, prompt, modelMessages)
}
