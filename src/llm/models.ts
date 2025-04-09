import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import  { type LanguageModelV1 } from 'ai'

const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
})

export const QUASAR_ALPHA: LanguageModelV1 = openrouter('openrouter/quasar-alpha')