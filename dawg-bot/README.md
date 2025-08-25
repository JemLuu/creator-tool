# Dawg Bot - Instagram Reel Manager

A comprehensive Instagram bot that allows users to save reels with ideas and manage them through Instagram DMs as a command-line interface.

## Features

- **Reel Storage**: Save Instagram reels with custom ideas/notes
- **Auto-tagging**: Automatically categorize reels based on first word
- **Command Interface**: Manage your reels through Instagram DMs
- **Tag Management**: Create and organize custom tags
- **Search & Filter**: Find reels by tags or keywords

## Commands

Send these commands via Instagram DM:

- `dawg list` - Show all tags with counts
- `dawg show <tag>` - Show reels in a specific tag
- `dawg tag <id> <tag>` - Tag or retag a reel
- `dawg delete <id>` - Delete a reel
- `dawg tags` - List all available tags
- `dawg help` - Show help message

To save a reel, just share it with a message:
- Example: Share a reel with "meme this would be funny"
- The bot will auto-tag it as "meme" and save your idea

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- Instagram account credentials

### Installation

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Set up the database:
   ```bash
   npx prisma migrate dev
   ```

5. Start the bot:
   ```bash
   npm start
   ```

### Docker Setup

1. Copy `.env.example` to `.env` and configure
2. Build and run with Docker Compose:
   ```bash
   docker-compose up -d
   ```

3. Run database migrations:
   ```bash
   docker-compose exec app npx prisma migrate deploy
   ```

## Architecture

### Components

- **Instagram Bot Service**: Handles DM interactions
- **Command Parser**: Processes user commands
- **Database Services**: Manages users, tags, and reels
- **Message Queue**: Handles async message processing
- **Rate Limiting**: Prevents API abuse

### Database Schema

- **Users**: Instagram users who interact with the bot
- **Tags**: Categories for organizing reels
- **Reels**: Saved Instagram reels with metadata and ideas

### Technology Stack

- **Backend**: Node.js with Express
- **Database**: PostgreSQL with Prisma ORM
- **Cache/Queue**: Redis with Bull
- **Instagram API**: instagram-private-api
- **Containerization**: Docker & Docker Compose

## Development

### Running in Development Mode

```bash
npm run dev
```

### Database Commands

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Deploy migrations (production)
npm run prisma:deploy
```

### Docker Commands

```bash
# Build containers
npm run docker:build

# Start services
npm run docker:up

# Stop services
npm run docker:down

# View logs
npm run docker:logs
```

## API Endpoints

- `GET /health` - Health check endpoint
- `GET /stats/:username` - Get user statistics

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/dawg_bot

# Instagram
INSTAGRAM_USERNAME=your_username
INSTAGRAM_PASSWORD=your_password

# Redis
REDIS_URL=redis://localhost:6379

# Server
PORT=3000
NODE_ENV=development

# Logging
LOG_LEVEL=info
```

## Security & Privacy

- All data is encrypted at rest
- User authentication via Instagram username
- Rate limiting to prevent abuse
- Soft delete for data recovery
- No sensitive data in logs

## Error Handling

- Graceful failure recovery
- Exponential backoff for retries
- Comprehensive error logging
- User-friendly error messages

## Performance

- Database indexes for fast queries
- Connection pooling
- Redis caching for frequent data
- Async message processing
- Horizontal scaling support

## License

MIT