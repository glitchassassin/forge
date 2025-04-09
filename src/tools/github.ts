import { experimental_createMCPClient } from 'ai'
import { Experimental_StdioMCPTransport } from 'ai/mcp-stdio'

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
