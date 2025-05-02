import express, { type Request, type Response } from 'express'
import { z } from 'zod'

export const createWebhookServer = (
	onMessage: (conversation: string, message: string) => Promise<void>,
) => {
	if (!process.env.WEBHOOK_SECRET) {
		console.log('WEBHOOK_SECRET not defined, skipping webhook server setup')
		return
	}

	const app = express()
	app.use(express.json())

	const messageSchema = z.object({
		content: z.string(),
	})

	app.post(
		`/${process.env.WEBHOOK_SECRET}/send/:conversationId`,
		async (req: Request, res: Response) => {
			try {
				const { content } = messageSchema.parse(req.body)
				const conversationId = req.params.conversationId

				if (!conversationId) {
					throw new Error('Conversation ID is required')
				}

				await onMessage(conversationId, content)

				res.status(200).json({ success: true })
			} catch (error) {
				console.error('Error processing webhook:', error)
				res.status(400).json({
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error',
				})
			}
		},
	)

	const port = process.env.PORT || 3000
	app.listen(port, () => {
		console.log(`Webhook server listening on port ${port}`)
	})
}
