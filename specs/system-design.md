# Forge Framework

Forge will be my personal assistant. I'll give it access to certain tools via
Model Context Protocol (MCP) so it can help me with my work and life admin. It
will also serve as a platform for experimentation with agentic AI systems.

## Technology

We'll use these tools:

- Typescript, ESLint, Prettier with
  [@epic-web/config](https://github.com/epicweb-dev/config) for type-checking
  and formatting
- Vitest for unit tests
- [discord.js](https://discord.js.org/) for Discord interactivity
- The [Vercel AI SDK](https://sdk.vercel.ai/docs/foundations/overview) for LLM
  interaction
- [OpenRouter](https://openrouter.ai/) as the model provider
- Docker for packaging & deployment on a local server

## Architecture

The central "hub" will be an event queue system, persisted to a sqlite db.

Handlers register with the event queue at runtime. If a message is pushed to the
queue, but its type has no handler, an error is logged.

Events are stored to the database, along with their status. Once a message has
been processed, it is marked done. When the system restarts, un-processed
messages are loaded from the database and added to the queue.

Debating how flexible we need to be here... the major components:

1. Interfaces: send/receive messages with Discord, send/receive authorization
   with Discord (or another tool)
2. LLM: receive messages, create new ones to call tools or send/receive messages
3. Tools: receive messages, do a thing, create a new message with the result

Actually interfaces can just be another tool - so that simplifies things a bit:

1. LLM: receive messages, create new ones to call tools or send/receive messages
2. Tools: receive messages, do a thing, create a new message with the result (or
   create a new message spontaneously, for Discord message, scheduled timer,
   etc.)

Human-in-the-loop requests are handled with a wrapper that receives a tool
request; creates a new "request_approval" message; and listens for a matching
"approve_tool" message. When the tool is approved,

## Message Types

```ts
type BaseMessage = {
	conversation: string
	created_at: Date
}

type AgentMessage = {
	type: 'agent'
	body: string
}

type ToolCallMessage<NAME, ARGS> = {
	type: 'tool-call'
	body: ToolCall<NAME, ARGS>
}

type ToolResultMessage<NAME, ARGS, RESULT> = {
	type: 'tool-result'
	body: ToolResult<NAME, ARGS, RESULT>
}

type ApprovalRequestMessage = {
	type: 'approval-request'
	body: ToolCall<NAME, ARGS>
}

type ApprovalResponseMessage = {
	type: 'approval-response'
	body: {
		toolCallId: string
		approved: boolean
		reason?: string
	}
}
```

We provide tools (wrapped to remove the `execute` function) to the LLM. The
generated tool calls are output. These are converted to ToolCallMessages and
pushed to the queue.

The Tool Call Handler looks up the tool, and if it does not require approval, it
simply executes the tool. If it does require approval, it sends an
ApprovalRequestMessage. If it receives an ApprovalResponseMessage for a tool
call that hasn't been run yet, it runs it.

The Approver formats the tool call and sends the request to the user. When the
user approves (or rejects), the Approver sends the ApprovalResponseMessage.

Now, let's think about the "conversation" context... will this always be in one
Discord channel? That would be one way to structure it.

There could be multiple users in the conversation, too (not currently, but maybe
down the road). Perhaps the tools have user-specific data. That's easy enough to
add down the road.

Keeping conversation context to a given channel is probably correct here.

The Discord tool sends messages for each channel (except ones originating from
the bot user) to the event queue. It also listens for tool calls for Discord and
sends the messages to the correct channel (based on the conversation context).

---

Now - what if this is, itself, a micro-agent framework?

The tools themselves are somewhat abstracted, wrapped with a handler. We need to
provide specific interfaces for the approval and persistence mechanisms. How
those are implemented is fairly flexible.

We don't necessarily even _need_ to match the AI SDK format. It can be flexible.

Let's start with pulling it into its own directory and depending how that goes
we can publish it separately.

What are we keeping?

- config (might look different)
  - per-agent configs?
- much of the discord client is reusable
- test setup
- mcp loader (maybe?)
- message segmentation logic will go in the Discord handler
