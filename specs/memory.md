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
