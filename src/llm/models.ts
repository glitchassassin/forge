import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { type LanguageModelV1 } from 'ai'

const openrouter = createOpenRouter({
	apiKey: process.env.OPENROUTER_API_KEY,
})

export const QUASAR_ALPHA: LanguageModelV1 = openrouter(
	'openrouter/quasar-alpha',
)
export const OPTIMUS_ALPHA: LanguageModelV1 = openrouter(
	'openrouter/optimus-alpha',
)
export const LLAMA_4_MAVERICK: LanguageModelV1 = openrouter(
	'meta-llama/llama-4-maverick:free',
)
export const GEMINI_2_5_PRO_EXPERIMENTAL: LanguageModelV1 = openrouter(
	'google/gemini-2.5-pro-exp-03-25:free',
)
export const DEEPSEEK_V3: LanguageModelV1 = openrouter(
	'deepseek/deepseek-chat-v3-0324:free',
)
export const DEEPSEEK_R1: LanguageModelV1 = openrouter(
	'deepseek/deepseek-r1:free',
)
