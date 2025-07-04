import { config } from 'dotenv';
config();

import express from 'express';

const app = express();
app.use(express.json());

// Simple test route
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Minimal server is working', 
    timestamp: new Date().toISOString(),
    status: 'success'
  });
});

// Health check route
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

const port = process.env.PORT || 3000;

app.listen(port, 'localhost', () => {
  console.log(`✅ Minimal server running on http://localhost:${port}`);
  console.log('📝 Test endpoints:');
  console.log(`   GET http://localhost:${port}/api/test`);
  console.log(`   GET http://localhost:${port}/health`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down minimal server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down minimal server...');
  process.exit(0);
}); 