# Replit Setup Guide

This ContentStageEngine project is now compatible with Replit. Follow these steps to get started:

## 1. Environment Setup

1. Copy the `env.example` file to `.env` and fill in your actual values:
   ```bash
   cp env.example .env
   ```

2. Edit the `.env` file with your actual API keys and configuration:
   - Database URL (PostgreSQL)
   - Supabase credentials
   - OpenAI API key
   - Stripe keys (if using billing features)
   - Other API keys as needed

## 2. Install Dependencies

```bash
npm install
```

## 3. Database Setup

If you have a PostgreSQL database:
```bash
npm run db:push
```

## 4. Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm run start:prod
```

### Quick Start (Default)
```bash
npm start
```

## 5. Access the Application

- The server will run on port 3000
- API endpoints will be available at `/api/*`
- The frontend will be served from the root `/`

## 6. Features Available

This is a full-stack content management and social media automation platform with:

- Video/audio upload and processing
- AI-powered content generation
- Social media scheduling
- Analytics dashboard
- Revenue tracking
- A/B testing capabilities
- And much more!

## 7. Troubleshooting

If you encounter issues:

1. Check that all environment variables are set correctly
2. Ensure your database connection is working
3. Verify that required API keys are valid
4. Check the console for any error messages

## 8. Support

For more detailed documentation, check the other markdown files in the project:
- `FEATURES.md` - List of all features
- `TECHNICAL_SPECIFICATIONS.md` - Technical details
- `IMPLEMENTATION_PLAN.md` - Implementation roadmap

Happy coding! 🚀 