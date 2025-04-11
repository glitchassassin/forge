# Implementing Memory

- Procedural Memory: long-term memory of how to perform tasks - combination of
  model weights + system prompt.
  - We _could_ make the system prompt flexible.
- Semantic Memory: Repository of facts about the world. Retrieved and inserted
  into system prompt as necessary.
- Episodic Memory: Storing past patterns of times agent performed well for
  few-shot learning to repeat the behavior again
  - Most useful for repeatable tasks vs. new/open-ended ones
  - Collecting user feedback is helpful here

When to update memory:

- "Hot Path": update memory as a tool call
- "Background": separate process reviews conversation periodically and updates
  memory at that time

Graphiti is available with an MCP server integration:

https://github.com/getzep/graphiti/blob/main/mcp_server/README.md

This might work well if we have a parallel memory processor reviewing and
cataloging conversations.

---

We should have a mechanism to:

1. Populate the system prompt
2. Query for memory directly
3. Update memory explicitly
4. Update memory asynchronously when conversation goes idle

We can set up a Docker Compose file with [the mcp server](https://github.com/getzep/graphiti/blob/main/mcp_server/docker-compose.yml) and [the API server](https://github.com/getzep/graphiti/blob/main/docker-compose.yml).

For now, we'll keep things simple and just start with the MCP server.