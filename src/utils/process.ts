import { spawn } from 'child_process'
import { resolve } from 'path'

/**
 * Spawns a detached process that will continue running even if the parent Node process exits.
 * @param scriptPath - Path to the bash script to execute
 * @param args - Arguments to pass to the script
 * @returns The spawned child process
 */
export function spawnDetachedProcess(scriptPath: string, args: string[] = []) {
	const absolutePath = resolve(scriptPath)

	const child = spawn('bash', [absolutePath, ...args], {
		detached: true,
		stdio: 'ignore',
		// Ensure the process doesn't inherit the parent's stdio
		// This is important for proper detachment
	})

	// Unref the child process so it can run independently
	child.unref()

	return child
}

/**
 * Triggers the update process which will:
 * 1. Kill the current Node process
 * 2. Pull latest changes
 * 3. Install dependencies
 * 4. Build the project
 * 5. Restart the Node process
 *
 * The update process will continue running even after this function returns.
 * All output will be logged to logs/update-<timestamp>.log
 */
export function triggerUpdate() {
	const updateScriptPath = resolve(process.cwd(), 'scripts/update.sh')
	return spawnDetachedProcess(updateScriptPath, [process.pid.toString()])
}
