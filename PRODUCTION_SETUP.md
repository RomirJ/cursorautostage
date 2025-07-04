# ContentStageEngine Production Setup

## Quick Start

1. **Fix Setup Issues:**
   ```bash
   ./scripts/fix-production-setup.sh
   ```

2. **Start in Development Mode:**
   ```bash
   ./start-dev.sh
   ```

3. **Start in Production Mode:**
   ```bash
   ./start-production.sh
   ```

4. **Health Check:**
   ```bash
   ./scripts/health-check.sh
   ```

## Docker Deployment

1. **Build and Run:**
   ```bash
   npm run docker:build
   npm run docker:run
   ```

2. **Stop:**
   ```bash
   npm run docker:stop
   ```

## Environment Variables

Make sure your `.env` file contains all required variables:

- `PORT`: Server port (default: 3000)
- `DATABASE_URL`: PostgreSQL connection string
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key
- `SUPABASE_ANON_KEY`: Supabase anonymous key
- OAuth credentials for all platforms (YouTube, Twitter, TikTok, Instagram, LinkedIn)

## Troubleshooting

### Common Issues

1. **ETIMEDOUT errors**: Network connectivity issues
2. **Database connection failures**: Check DATABASE_URL in .env
3. **Frontend build failures**: Use API-only mode
4. **Permission denied**: Check file permissions

### Health Check

Run the health check script to verify all components:
```bash
./scripts/health-check.sh
```

## Features Available

✅ Advanced upload capabilities (chunked uploads)
✅ Platform integrations (YouTube, X/Twitter, TikTok, Instagram)
✅ Session management with database persistence
✅ Real-time progress tracking via WebSocket
✅ Comprehensive error handling and retry logic
✅ AI-powered content processing
✅ Automated posting service
✅ Analytics and engagement tracking
✅ Revenue tracking and monetization
✅ A/B testing capabilities
✅ Feature flags system

## API Endpoints

- `GET /api/test` - Health check
- `POST /api/upload` - File upload
- `POST /api/test-upload` - Test upload
- `GET /api/preview/:id` - Content preview
- `POST /api/social/publish` - Publish to social platforms
- `GET /api/analytics` - Analytics data
- `GET /api/revenue` - Revenue tracking

## Support

For issues or questions, check the documentation in the `docs/` directory.
