import { z } from 'zod'

export const EventTypeSchema = z.enum(['discord', 'scheduled'])
export type EventType = z.infer<typeof EventTypeSchema>

export const MessageRoleSchema = z.enum(['system', 'user', 'assistant', 'tool'])
export type MessageRole = z.infer<typeof MessageRoleSchema>

export const MessageSchema = z.object({
  role: MessageRoleSchema,
  content: z.string(),
  name: z.string().optional(),
})

export type Message = z.infer<typeof MessageSchema>

export const EventSchema = z.object({
  type: EventTypeSchema,
  channel: z.string(),
  messages: z.array(MessageSchema),
})

export type Event = z.infer<typeof EventSchema> 