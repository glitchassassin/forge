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
- Docker for packaging & deployment on Fly.io

## Architecture

### Main Conversation Loop

The main loop cycles through each conversation.

#### Tool Calls

If there are any approved but unfinished tool calls for the conversation, it
invokes them all in parallel, but does not wait for them to finish. The
resulting messages (output of the tool, or error if it failed) are pushed into
the Message table and the tool call's finished timestamp is set.

#### Inference Messages

If there are no new `user` or `tool` messages with an ID greater than the
conversation's last processed message ID, it ends the loop.

Otherwise, all context for the conversation (up to the most recent 100 messages)
is fetched from the Message table and provided, along with the system prompt, to
generateText. If any of the `assistant` messages in the context have a tool call
with no corresponding result, a placeholder `tool` message is appended with the
status of the tool call (pending approval or in progress).

The resulting messages are pushed to the table. Any tool calls are added to the
ToolCall table. For now, they are automatically marked as approved.

It updates the conversation's last-processed ID when it finishes processing.

## Models

- **Conversation**: represents a channel in Discord (ID is the channel's
  internal ID). Tracks the last Message ID of the conversation that was
  processed.
- **Message**: stores a CoreMessage (as a JSON string) and is linked to a
  Conversation. The message role ("tool", "user", "assistant", "system") is
  copied to a text field on the Message record for querying purposes. The ID is
  a ULID, so it is lexicographically sortable
- **ToolCall**: stores status of a tool call. Includes the tool call ID, and
  points to the original message ID which requested the tool call. Tracks
  timestamps of when the tool call was requested, approved, started, and
  finished.
