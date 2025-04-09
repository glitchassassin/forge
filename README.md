# Discord Agent

A personal assistant bot for Discord that helps with work and life admin tasks using AI capabilities. Built with TypeScript, Discord.js, and the Vercel AI SDK.

## Features

- Discord integration for natural language interaction
- AI-powered task management and automation
- Scheduled reminders and events
- Tool integration via Model Context Protocol (MCP)
- Built-in SQLite database for persistence
- Docker support for easy deployment

## Prerequisites

- Node.js 22 or later (for built-in SQLite support)
- npm 9 or later
- Docker (optional, for containerized deployment)
- A Discord Bot Token (from [Discord Developer Portal](https://discord.com/developers/applications))
- An OpenRouter API Key (from [OpenRouter](https://openrouter.ai/))

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/discord-agent.git
   cd discord-agent
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.sample .env
   ```
   Edit `.env` and fill in your Discord token and OpenRouter API key.

4. Create required directories:
   ```bash
   mkdir -p data logs
   ```

5. Run in development mode:
   ```bash
   npm run dev
   ```

## Development

- `npm run dev` - Start the development server with hot reload
- `npm run build` - Build the project for production
- `npm run test` - Run tests
- `npm run test:coverage` - Run tests with coverage report
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## Docker Deployment

1. Build the Docker image:
   ```bash
   docker build -t discord-agent .
   ```

2. Run the container:
   ```bash
   docker run -d \
     --name discord-agent \
     --env-file .env \
     -v $(pwd)/data:/app/data \
     -v $(pwd)/logs:/app/logs \
     discord-agent
   ```

## Project Structure

```
src/
├── core/           # Core functionality
│   ├── database/   # Database operations
│   ├── discord/    # Discord client and handlers
│   └── llm/        # Language model integration
├── events/         # Event definitions and handlers
├── handlers/       # Message and event handlers
├── tools/          # MCP tools and utilities
├── types/          # TypeScript type definitions
└── utils/          # Utility functions
```

## License

MIT 