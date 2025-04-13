import { z } from 'zod'

const openRouterModelSchema = z.object({
	id: z.string(),
	name: z.string(),
	created: z.number(),
	description: z.string(),
	architecture: z.object({
		input_modalities: z.array(z.string()),
		output_modalities: z.array(z.string()),
		tokenizer: z.string(),
	}),
	top_provider: z.object({
		is_moderated: z.boolean(),
	}),
	pricing: z.object({
		prompt: z.string().optional(),
		completion: z.string().optional(),
		image: z.string().optional(),
		request: z.string().optional(),
		input_cache_read: z.string().optional(),
		input_cache_write: z.string().optional(),
		web_search: z.string().optional(),
		internal_reasoning: z.string().optional(),
	}),
	context_length: z.number().nullable(),
	per_request_limits: z.record(z.string(), z.string()).nullable(),
})

const openRouterModelsResponseSchema = z.object({
	data: z.array(openRouterModelSchema),
})

const openRouterEndpointSchema = z.object({
	name: z.string(),
	context_length: z.number(),
	pricing: z.object({
		request: z.string(),
		image: z.string(),
		prompt: z.string(),
		completion: z.string(),
	}),
	provider_name: z.string(),
	supported_parameters: z.array(z.string()),
})

const openRouterEndpointsResponseSchema = z.object({
	data: z.object({
		id: z.string(),
		name: z.string(),
		created: z.number(),
		description: z.string(),
		architecture: z.object({
			input_modalities: z.array(z.string()),
			output_modalities: z.array(z.string()),
			tokenizer: z.string(),
			instruct_type: z.string().nullable(),
		}),
		endpoints: z.array(openRouterEndpointSchema),
	}),
})

export type OpenRouterModel = z.infer<typeof openRouterModelSchema>
export type OpenRouterEndpoint = z.infer<typeof openRouterEndpointSchema>

async function getAvailableModels(): Promise<OpenRouterModel[]> {
	const response = await fetch('https://openrouter.ai/api/v1/models')
	if (!response.ok) {
		throw new Error(`Failed to fetch models: ${response.statusText}`)
	}
	const data = await response.json()
	const validated = openRouterModelsResponseSchema.parse(data)
	return validated.data
}

async function getModelEndpoints(
	modelId: string,
): Promise<OpenRouterEndpoint[]> {
	const [author, slug] = modelId.split('/')
	const response = await fetch(
		`https://openrouter.ai/api/v1/models/${author}/${slug}/endpoints`,
	)
	if (!response.ok) {
		throw new Error(
			`Failed to fetch endpoints for ${modelId}: ${response.statusText}`,
		)
	}
	const data = await response.json()
	const validated = openRouterEndpointsResponseSchema.parse(data)
	return validated.data.endpoints
}

async function modelSupportsTools(modelId: string): Promise<boolean> {
	const endpoints = await getModelEndpoints(modelId)
	return endpoints.some((endpoint) =>
		endpoint.supported_parameters.includes('tools'),
	)
}

export const availableModels = (await getAvailableModels()).filter((model) => {
	// Filter out models with non-zero pricing
	return Object.values(model.pricing).every((price) => price === '0')
})

// Filter out models that don't support tools
const modelsWithToolSupport = await Promise.all(
	availableModels.map(async (model) => {
		const supportsTools = await modelSupportsTools(model.id)
		return { model, supportsTools }
	}),
)

export const availableModelsWithTools = modelsWithToolSupport
	.filter(({ supportsTools }) => supportsTools)
	.map(({ model }) => model)
