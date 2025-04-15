- [x] Split out MCP sub-agents
- [x] Set up slash commands to create new chat channels
- [x] Configure models dynamically
- [ ] Set up a parallel Archive job that processes past messages into Graphiti
- [ ] Experiment with better prompts for Graphiti - perhaps a dedicated agent?
- [ ] Pull Graphiti MCP into this repo and customize it
  - Maybe initialize channel category automatically?
- [ ] Figure out deployment - how can I dev on my laptop and keep it running
      when I'm not on my laptop?

# MCP Servers to Support

- [x] GitHub
- [x] Scheduler (for re-prompting)
- [x] Obsidian
- [x] Web search/scraping
  - https://github.com/executeautomation/mcp-playwright
- [ ] Code interpreter
  - https://github.com/Automata-Labs-team/code-sandbox-mcp
- [ ] ICS calendar reader
- [ ] Home Assistant
  - https://github.com/tevonsb/homeassistant-mcp
  - https://github.com/voska/hass-mcp
- [ ] Azure Devops: https://github.com/Vortiago/mcp-azure-devops
- [ ] Memory
  - https://github.com/basicmachines-co/basic-memory
  - https://github.com/modelcontextprotocol/servers/tree/main/src/memory
  - Mem0 example: https://github.com/mem0ai/mem0-mcp
- [ ] Gmail
  - https://github.com/GongRzhe/Gmail-MCP-Server
  - https://github.com/baryhuang/mcp-headless-gmail
- [ ] RAG?
  - https://github.com/chroma-core/chroma-mcp
- [ ] Other Interesting Options
  - https://github.com/hichana/goalstory-mcp
  - https://github.com/liuyoshio/mcp-compass
  - https://github.com/hungryrobot1/MCP-PIF

New Ideas:

- [ ] Need to aggressively simplify this further: separate out scheduling, maybe
      communication channel?
- [ ] Make the structure of this dynamic (models already are; but also available
      MCPs, event pipeline...)
- [ ] Human-in-the-loop confirmation needs work. We ought to be able to handle
      it asynchronously and resume the thread when approval is granted.
- [x] Ha - message splitting is busted. We need to avoid splitting across ```
      boundaries, or else restart the boundary after the split.

So... the event pipeline thing really needs more thought. We need to be able to
pause and resume the agent's operation when a tool call requires permission.

This _might_ be as simple as "queue up the tool call, and push the results to
the event queue to resume the conversation when it arrives."

If the LLM makes multiple tool calls, we should collect them all before
triggering the conversation to continue. If there's an error, we report that.

Then the Discord integration can simply listen to and write to the event queue
as messages come in (or need to be surfaced).

Some of the messages are relevant for the agent (messages from users). Some are
not (permission for the tools, which also listen to the event queue).

If everything is driven by the queue, then asynchronous polling (from a local
resource!) becomes a possibility.

Gotta explore this further: how do stateful MCP connections fit in here?

If the core of the logic (event queue, Discord handler, LLM handler) lives in
Cloudflare, and local pieces connect via websocket, this might solve our
location issues. Need to deal with the loss of connectivity, however.

This is starting to get interesting. We should write this up.

For now:

1. Keep everything (including the event queue) local
2. Trigger Discord messages, confirmations from the event queue
3. Handle tool calls and results from the event queue

Do we want an event queue or a pub/sub channel?

- What happens if an event gets missed? Since we're still running locally, the
  handlers are also local, and we don't need to worry about connection issues.
- Do we need to retry messages in the event of a failure? Probably not... I
  think.
- Eventually, we probably _do_ want an event queue. For now, a pub/sub channel
  is probably simpler.
