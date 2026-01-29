/**
 * AI Model Constants
 *
 * Defines supported models for the vibe-coding-platform.
 * These model IDs are routed through kgateway to the appropriate backend.
 */

export enum Models {
  AmazonNovaPro = 'amazon/nova-pro',
  AnthropicClaude4Sonnet = 'anthropic/claude-4-sonnet',
  AnthropicClaude45Sonnet = 'anthropic/claude-sonnet-4.5',
  GoogleGeminiFlash = 'google/gemini-2.5-flash',
  MoonshotKimiK2 = 'moonshotai/kimi-k2',
  OpenAIGPT52 = 'openai/gpt-5.2',
  XaiGrok3Fast = 'xai/grok-3-fast',
}

/**
 * Default model to use when none is specified
 */
export const DEFAULT_MODEL = Models.AnthropicClaude45Sonnet

/**
 * List of supported model IDs
 */
export const SUPPORTED_MODELS: string[] = [
  Models.OpenAIGPT52,
  Models.AmazonNovaPro,
  Models.AnthropicClaude4Sonnet,
  Models.AnthropicClaude45Sonnet,
  Models.GoogleGeminiFlash,
  Models.MoonshotKimiK2,
  Models.XaiGrok3Fast,
]

/**
 * Test prompts for quick-start functionality
 */
export const TEST_PROMPTS = [
  'Generate a Next.js app that allows to list and search Pokemons',
  'Create a `golang` server that responds with "Hello World" to any request',
]
