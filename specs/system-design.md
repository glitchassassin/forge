# Discord Agent

The Discord Agent will be my personal assistant. I'll give it access to certain tools via Model Context Protocol (MCP) so it can help me with my work and life admin. It will also serve as a platform for experimentation with agentic AI systems.

## Technology

We'll use these tools: 

- Typescript, ESLint, Prettier with [@epic-web/config](https://github.com/epicweb-dev/config) for type-checking and formatting
- Vitest for unit tests
- [discord.js](https://discord.js.org/) for Discord interactivity
- The [Vercel AI SDK](https://sdk.vercel.ai/docs/foundations/overview) for LLM interaction
- [OpenRouter](https://openrouter.ai/) as the model provider
- Docker for packaging & deployment on a local server

## Architecture

The Agent will run in a Docker container, with credentials for Docker, OpenRouter, etc. provided via environment variables. It uses a local SQLite database (mounted with a volume) for persistence.

The Agent listens for triggering events (which may include incoming messages, scheduled reminders, etc.) and uses the event and recent conversation context to prompt the model. The model can invoke tools (including MCP tools) to fetch data or carry out commands. These tool calls are displayed in Discord, and may require user authorization via a Discord button. The model's streaming text is sent to the chat as one or more messages, split by paragraphs or tool calls.

## Limitations

This implementation is designed to work with a single Discord server. The Discord token will be provided to the Docker container via environment variable. This implementation will not provide any authentication or authorization mechanisms for users.

## Details

### Event Queue

Messages (including messages from Discord, scheduled reminders, or triggers from external systems) are added to a queue. These are processed serially - the handler takes a message from the queue, and once the model handler finishes running (including tool calls), the next message is processed.

The event message format will look like this:

```ts
type EventMessage = {
    type: "discord" | "scheduled",
    channel: string,
    messages: Array<CoreSystemMessage | CoreUserMessage | CoreAssistantMessage | CoreToolMessage>,
}
```

#### Discord Events

We'll use a slash command `/monitor` to add a channel to listen to. When a message comes in on a monitored channel, or when the agent is specifically tagged, that message and the previous context (100 messages or 1 hour, whichever is smaller) are added to an event and sent to the queue. The user's messages in the Discord history are created as CoreUserMessages, and the Agent's are CoreAssistantMessages.

#### Scheduled Events

We'll use a custom `schedule` tool that accepts a cron or date/time and a text prompt. This will be stored in SQLite. An interval will run every minute to check for matching scheduled events and, if one is found, push the event to the event queue.

### Event Handler

The event handler takes a message from the queue, which may include past conversational context, and compiles this into a set of messages for the LLM's streamText function. As the text streams, paragraphs are split up and sent as separate messages to the appropriate Discord channel (based on the channel in the event message).

### Tool Calls

The AI SDK's createMCPClient function creates tools for the connected MCP servers: https://sdk.vercel.ai/cookbook/node/mcp-tools

We'll need a "withConfirmation" function that can wrap an object of tools. This will run in the context of the event handler, so that when one of the wrapped tools is invoked, a message will be fired off to Discord that describes the intended action and displays "Cancel" and "Approve" buttons. If the user approves the action, the tool call continues; otherwise, it fails, and the rest of the event handler should be aborted.