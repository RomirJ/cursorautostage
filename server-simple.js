import { config } from 'dotenv';
config();

import express from 'express';

const app = express();
app.use(express.json());

// Simple test route
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'ContentStageEngine API is working!', 
    timestamp: new Date().toISOString(),
    status: 'success',
    version: '1.0.0'
  });
});

// Health check route
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Basic upload test route
app.post('/api/test-upload', (req, res) => {
  res.json({ 
    message: 'Upload endpoint ready',
    timestamp: new Date().toISOString(),
    status: 'success'
  });
});

const port = process.env.PORT || 3000;

app.listen(port, 'localhost', () => {
  console.log(`🚀 ContentStageEngine server running on http://localhost:${port}`);
  console.log('📝 Available endpoints:');
  console.log(`   GET  http://localhost:${port}/api/test`);
  console.log(`   GET  http://localhost:${port}/health`);
  console.log(`   POST http://localhost:${port}/api/test-upload`);
  console.log('');
  console.log('✅ Server is ready to handle requests!');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down ContentStageEngine server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down ContentStageEngine server...');
  process.exit(0);
}); 