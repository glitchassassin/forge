import { experimental_createMCPClient, generateText, tool } from 'ai'
import { Experimental_StdioMCPTransport } from 'ai/mcp-stdio'
import { z } from 'zod'
import { GEMINI_2_5_PRO_EXPERIMENTAL } from '../llm/models'

if (!process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
	throw new Error('GITHUB_PERSONAL_ACCESS_TOKEN is not set')
}

export const GITHUB = await experimental_createMCPClient({
	transport: new Experimental_StdioMCPTransport({
		command: 'docker',
		args: [
			'run',
			'-i',
			'--rm',
			'-e',
			'GITHUB_PERSONAL_ACCESS_TOKEN=' +
				process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
			'ghcr.io/github/github-mcp-server',
		],
	}),
})

export const githubAgent = tool({
	description: `
## GitHub Agent

A specialized agent for interacting with GitHub repositories and managing development workflows.

### How to Use
Make natural language requests to perform GitHub operations. Examples:
- "Create a new branch called feature-x from main"
- "Open a pull request for the changes in branch feature-x"
- "Search for issues containing the word 'bug' in repository user/repo"
- "Get the contents of README.md from the main branch"

### Available Operations
- Repository & Branch Management
- Issue & Pull Request Operations
- Code Review & Comments
- File Operations
- Code Search
- Code Scanning`,
	parameters: z.object({
		request: z.string(),
	}),
	execute: async ({ request }) => {
		const response = await generateText({
			model: GEMINI_2_5_PRO_EXPERIMENTAL,
			prompt: `
			You are a GitHub agent.
			You are given a request to perform a GitHub operation.
			You need to use the available tools to perform the operation.
			Then, report the results in a concise but detailed manner.
			
			Request: ${request}
			`,
			maxSteps: 10,
			tools: {
				...(await GITHUB.tools()),
			},
		})
		console.log('githubAgent finishReason', response.finishReason)
		return JSON.stringify({
			text: response.text,
			finishReason: response.finishReason,
		})
	},
})
