# ContentStageEngine - AutoStage

AI-Powered Content Creation & Publishing Platform

## 🚀 Quick Start with Docker

### Prerequisites
- Docker and Docker Compose installed
- Environment variables configured (see `.env` file)

### Development Mode
```bash
# Start all services with hot reloading
npm run docker:dev

# Or manually:
docker-compose -f docker-compose.dev.yml up --build
```

### Production Mode
```bash
# Build and start production services
npm run docker:prod

# Or manually:
docker-compose up --build -d
```

### Docker Commands
```bash
# View logs
npm run docker:logs

# Stop services
npm run docker:stop

# Clean up (removes volumes and images)
npm run docker:clean

# Build image only
npm run docker:build

# Run single container
npm run docker:run
```

## 🔧 Manual Setup (Alternative)

### Prerequisites
- Node.js 18+
- PostgreSQL (or Supabase)
- Redis
- FFmpeg

### Installation
```bash
npm install
npm run build
npm start
```

## 📁 Project Structure

```
ContentStageEngine/
├── client/          # React frontend
├── server/          # Express.js backend
├── shared/          # Shared types and schemas
├── migrations/      # Database migrations
├── uploads/         # File uploads
├── Dockerfile       # Production Docker image
├── Dockerfile.dev   # Development Docker image
├── docker-compose.yml      # Production services
└── docker-compose.dev.yml  # Development services
```

## 🌐 Services

- **AutoStage App** (Port 5000) - Main application
- **Redis** (Port 6379) - Caching and queues
- **PostgreSQL** (Port 5432) - Database (development only)

## 🔑 Environment Variables

Create a `.env` file with:
```env
DATABASE_URL=your_database_url
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
OPENAI_API_KEY=your_openai_api_key
ASSEMBLYAI_API_KEY=your_assemblyai_api_key
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
```

## 🚀 Features

- 📹 Video/Audio upload and processing
- 🎙️ AI-powered transcription
- 📝 Automatic content generation
- 📅 Multi-platform scheduling
- 📊 Analytics and engagement tracking
- 💰 Monetization features
- 🔄 Real-time progress tracking

## 🛠️ Development

### Running Tests
```bash
npm test
npm run test:unit
npm run test:integration
npm run test:e2e
```

### Database Management
```bash
npm run db:migrate
npm run db:generate
npm run db:studio
```

## 📦 Deployment

### Docker Production
```bash
# Build and deploy
docker-compose up --build -d

# Monitor
docker-compose logs -f autostage
```

### Manual Production
```bash
npm run build
NODE_ENV=production npm start
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details
