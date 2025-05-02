import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		setupFiles: ['./tests/setup-test-env.ts'],
		globalSetup: ['./tests/global-setup.ts'],
		globals: true,
		environment: 'node',
		coverage: {
			reporter: ['text', 'json', 'html'],
		},
	},
})
