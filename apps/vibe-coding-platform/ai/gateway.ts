/**
 * AI Gateway Configuration
 *
 * Configures AI model providers using direct SDKs:
 * - Anthropic SDK for Claude models
 * - OpenAI SDK for GPT models
 *
 * API keys are provided via environment variables or Kubernetes secrets.
 */

import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { Models } from './constants'
import type { JSONValue } from 'ai'
import type { OpenAIResponsesProviderOptions } from '@ai-sdk/openai'
import type { LanguageModelV3 } from '@ai-sdk/provider'

/**
 * Get available models
 * Returns a static list of supported models
 */
export async function getAvailableModels() {
  return Object.values(Models).map((id) => ({
    id,
    name: getModelDisplayName(id),
  }))
}

/**
 * Get display name for a model ID
 */
function getModelDisplayName(modelId: string): string {
  const displayNames: Record<string, string> = {
    [Models.OpenAIGPT52]: 'GPT-5.2',
    [Models.AmazonNovaPro]: 'Amazon Nova Pro',
    [Models.AnthropicClaude4Sonnet]: 'Claude 4 Sonnet',
    [Models.AnthropicClaude45Sonnet]: 'Claude 4.5 Sonnet',
    [Models.GoogleGeminiFlash]: 'Gemini 2.5 Flash',
    [Models.MoonshotKimiK2]: 'Kimi K2',
    [Models.XaiGrok3Fast]: 'Grok-3 Fast',
  }
  return displayNames[modelId] ?? modelId
}

export interface ModelOptions {
  model: LanguageModelV3
  providerOptions?: Record<string, Record<string, JSONValue>>
  headers?: Record<string, string>
}

// Anthropic provider instance (lazy initialized)
let anthropicProvider: ReturnType<typeof createAnthropic> | null = null

function getAnthropicProvider() {
  if (!anthropicProvider) {
    anthropicProvider = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }
  return anthropicProvider
}

// OpenAI provider instance (lazy initialized)
let openaiProvider: ReturnType<typeof createOpenAI> | null = null

function getOpenAIProvider() {
  if (!openaiProvider) {
    openaiProvider = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openaiProvider
}

// Model ID to provider native ID mapping
const ANTHROPIC_MODEL_MAP: Record<string, string> = {
  [Models.AnthropicClaude4Sonnet]: 'claude-4-sonnet-20250514',
  [Models.AnthropicClaude45Sonnet]: 'claude-sonnet-4-5-20250514',
}

const OPENAI_MODEL_MAP: Record<string, string> = {
  [Models.OpenAIGPT52]: 'gpt-5.2',
}

/**
 * Check if a model is an Anthropic model
 */
function isAnthropicModel(modelId: string): boolean {
  return modelId in ANTHROPIC_MODEL_MAP
}

/**
 * Check if a model is an OpenAI model
 */
function isOpenAIModel(modelId: string): boolean {
  return modelId in OPENAI_MODEL_MAP
}

/**
 * Get model options for a specific model ID
 *
 * Configures provider-specific options like:
 * - OpenAI: Reasoning support, service tier
 * - Anthropic: Cache control, tool streaming headers
 */
export function getModelOptions(
  modelId: string,
  options?: { reasoningEffort?: 'low' | 'medium' | 'high' }
): ModelOptions {
  // Anthropic models
  if (isAnthropicModel(modelId)) {
    const provider = getAnthropicProvider()
    const nativeModelId = ANTHROPIC_MODEL_MAP[modelId]

    return {
      model: provider(nativeModelId),
      headers: { 'anthropic-beta': 'fine-grained-tool-streaming-2025-05-14' },
      providerOptions: {
        anthropic: {
          cacheControl: { type: 'ephemeral' },
        },
      },
    }
  }

  // OpenAI models
  if (isOpenAIModel(modelId)) {
    const provider = getOpenAIProvider()
    const nativeModelId = OPENAI_MODEL_MAP[modelId]

    return {
      model: provider(nativeModelId),
      providerOptions: {
        openai: {
          include: ['reasoning.encrypted_content'],
          reasoningEffort: options?.reasoningEffort ?? 'low',
          reasoningSummary: 'auto',
          serviceTier: 'priority',
        } satisfies OpenAIResponsesProviderOptions,
      },
    }
  }

  // Fallback: try as OpenAI model (for unknown models)
  const provider = getOpenAIProvider()
  return {
    model: provider(modelId),
  }
}
