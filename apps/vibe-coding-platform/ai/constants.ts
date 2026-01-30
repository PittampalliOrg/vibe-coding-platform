/**
 * AI Model Constants
 *
 * Defines supported models for the vibe-coding-platform.
 * These model IDs are routed through kgateway to the appropriate backend.
 */

export enum Models {
  AmazonNovaPro = 'amazon/nova-pro',
  AnthropicClaude4Sonnet = 'anthropic/claude-4-sonnet',
  AnthropicClaude45Haiku = 'anthropic/claude-haiku-4.5',
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
  Models.AnthropicClaude45Haiku,
  Models.AnthropicClaude45Sonnet,
  Models.GoogleGeminiFlash,
  Models.MoonshotKimiK2,
  Models.XaiGrok3Fast,
]

/**
 * Test prompts for quick-start functionality
 */
export const TEST_PROMPTS = [
  'Create a react app that allows a user to measure their heart rate by clicking a button in sync with their heartbeat',
  'Sleep for 30 seconds and then return a random sentence. Do not code anything.',
]
