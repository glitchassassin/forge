import type { LanguageModelV1, Tool, ToolSet } from 'ai'
import { generateText } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Agent } from '../agent'
import { AgentMessage } from '../types'

vi.mock('ai', () => ({
	generateText: vi.fn(),
}))

describe('Agent', () => {
	const mockModel: LanguageModelV1 = {
		provider: 'test',
		modelId: 'test-model',
		specificationVersion: 'v1',
		defaultObjectGenerationMode: 'json',
		doGenerate: vi.fn(),
		doStream: vi.fn(),
	}

	const mockTool: Tool = {
		description: 'A test tool',
		parameters: {
			type: 'object',
			properties: {
				test: { type: 'string' },
			},
			required: ['test'],
		},
		execute: vi.fn(),
	}

	const mockTools: ToolSet = {
		'test-tool': mockTool,
	}

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('should stub tools correctly when generating text', async () => {
		const agent = new Agent({ model: mockModel, tools: mockTools })
		const mockMessage: AgentMessage = {
			type: 'agent',
			body: [{ role: 'user', content: 'test' }],
			id: 'test-id',
			conversation: 'test-conversation',
			created_at: new Date(),
			handled: false,
		}
		const mockToolCall = {
			type: 'tool-call' as const,
			toolName: 'test-tool',
			toolCallId: 'test-call-id',
			args: { test: 'data' },
		}

		vi.mocked(generateText).mockResolvedValueOnce({
			text: '',
			toolCalls: [mockToolCall],
			reasoning: '',
			files: [],
			reasoningDetails: [],
			finishReason: 'stop',
			usage: {
				promptTokens: 0,
				completionTokens: 0,
				totalTokens: 0,
			},
			response: {
				id: 'test-id',
				timestamp: new Date(),
				modelId: 'test-model',
				messages: [],
				body: {},
			},
			sources: [],
			experimental_output: {},
			toolResults: [],
			warnings: [],
			steps: [],
			request: {},
			logprobs: [],
			providerMetadata: {},
			experimental_providerMetadata: {},
		})

		const result = await agent.run(mockMessage)

		expect(generateText).toHaveBeenCalledWith({
			model: mockModel,
			messages: mockMessage.body,
			tools: {
				'test-tool': {
					description: 'A test tool',
					parameters: {
						type: 'object',
						properties: {
							test: { type: 'string' },
						},
						required: ['test'],
					},
				},
			},
			toolChoice: 'required',
			maxSteps: 1,
		})

		expect(result).toHaveLength(1)
		expect(result[0]).toEqual({
			type: 'tool-call',
			body: {
				toolCall: mockToolCall,
				messages: mockMessage.body,
			},
			id: expect.any(String),
			conversation: mockMessage.conversation,
			created_at: expect.any(Date),
			handled: false,
		})
	})

	it('should handle multiple tool calls', async () => {
		const agent = new Agent({ model: mockModel, tools: mockTools })
		const mockMessage: AgentMessage = {
			type: 'agent',
			body: [{ role: 'user', content: 'test' }],
			id: 'test-id',
			conversation: 'test-conversation',
			created_at: new Date(),
			handled: false,
		}

		const mockToolCalls = [
			{
				type: 'tool-call' as const,
				toolName: 'test-tool',
				toolCallId: 'test-call-id-1',
				args: { test: 'data1' },
			},
			{
				type: 'tool-call' as const,
				toolName: 'test-tool',
				toolCallId: 'test-call-id-2',
				args: { test: 'data2' },
			},
		]

		vi.mocked(generateText).mockResolvedValueOnce({
			text: '',
			toolCalls: mockToolCalls,
			reasoning: '',
			files: [],
			reasoningDetails: [],
			finishReason: 'stop',
			usage: {
				promptTokens: 0,
				completionTokens: 0,
				totalTokens: 0,
			},
			response: {
				id: 'test-id',
				timestamp: new Date(),
				modelId: 'test-model',
				messages: [],
				body: {},
			},
			sources: [],
			experimental_output: {},
			toolResults: [],
			warnings: [],
			steps: [],
			request: {},
			logprobs: [],
			providerMetadata: {},
			experimental_providerMetadata: {},
		})

		const result = await agent.run(mockMessage)
		expect(result).toHaveLength(2)
		expect(result[0]?.body.toolCall).toEqual(mockToolCalls[0])
		expect(result[1]?.body.toolCall).toEqual(mockToolCalls[1])
	})

	it('should work without tools', async () => {
		const agent = new Agent({ model: mockModel })
		const mockMessage: AgentMessage = {
			type: 'agent',
			body: [{ role: 'user', content: 'test' }],
			id: 'test-id',
			conversation: 'test-conversation',
			created_at: new Date(),
			handled: false,
		}

		vi.mocked(generateText).mockResolvedValueOnce({
			text: '',
			toolCalls: [],
			reasoning: '',
			files: [],
			reasoningDetails: [],
			finishReason: 'stop',
			usage: {
				promptTokens: 0,
				completionTokens: 0,
				totalTokens: 0,
			},
			response: {
				id: 'test-id',
				timestamp: new Date(),
				modelId: 'test-model',
				messages: [],
				body: {},
			},
			sources: [],
			experimental_output: {},
			toolResults: [],
			warnings: [],
			steps: [],
			request: {},
			logprobs: [],
			providerMetadata: {},
			experimental_providerMetadata: {},
		})

		const result = await agent.run(mockMessage)
		expect(result).toHaveLength(0)
		expect(generateText).toHaveBeenCalledWith({
			model: mockModel,
			messages: mockMessage.body,
			tools: undefined,
			toolChoice: 'required',
			maxSteps: 1,
		})
	})
})
