import { experimental_createMCPClient, generateText, tool } from 'ai'
import { Experimental_StdioMCPTransport } from 'ai/mcp-stdio'
import { z } from 'zod'
import { GEMINI_2_5_PRO_EXPERIMENTAL } from '../llm/models'

if (!process.env.OBSIDIAN_VAULT_PATH) {
	throw new Error('OBSIDIAN_VAULT_PATH is not set')
}

export const OBSIDIAN = await experimental_createMCPClient({
	transport: new Experimental_StdioMCPTransport({
		command: 'npx',
		args: ['-y', 'obsidian-mcp', process.env.OBSIDIAN_VAULT_PATH],
	}),
})

export const obsidianAgent = tool({
	description: `
## Obsidian Agent

A specialized agent for interacting with Obsidian vaults and managing knowledge workflows.

### How to Use
Make natural language requests to perform Obsidian operations. Examples:
- "Create a new note about TypeScript best practices"
- "Search for notes containing the word 'project'"
- "Link the current note to related notes about AI"
- "Get the contents of my daily note from yesterday"
- "Find all notes that mention a specific topic"

### Available Operations
- read-note: Read the contents of a note
- create-note: Create a new note
- edit-note: Edit an existing note
- delete-note: Delete a note
- move-note: Move a note to a different location
- create-directory: Create a new directory
- search-vault: Search notes in the vault
- add-tags: Add tags to a note
- remove-tags: Remove tags from a note
- rename-tag: Rename a tag across all notes
- manage-tags: List and organize tags
- list-available-vaults: List all available vaults (helps with multi-vault setups)`,
	parameters: z.object({
		request: z.string(),
	}),
	execute: async ({ request }) => {
		const response = await generateText({
			model: GEMINI_2_5_PRO_EXPERIMENTAL,
			prompt: `
			You are an Obsidian agent.
			You are given a request to perform an Obsidian operation.
			You need to use the available tools to perform the operation.
			Then, report the results in a concise but detailed manner.
			
			Request: ${request}
			`,
			maxSteps: 10,
			tools: {
				...(await OBSIDIAN.tools()),
			},
		})
		return JSON.stringify({
			text: response.text,
			finishReason: response.finishReason,
		})
	},
})
