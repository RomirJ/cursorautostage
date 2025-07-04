import { config } from 'dotenv';
config();

console.log('✅ dotenv loaded');

// Test basic imports one by one
try {
  console.log('🔄 Testing express import...');
  const express = await import('express');
  console.log('✅ express imported successfully');
} catch (error) {
  console.error('❌ express import failed:', error);
  process.exit(1);
}

try {
  console.log('🔄 Testing routes import...');
  const { registerRoutes } = await import('./routes');
  console.log('✅ routes imported successfully');
} catch (error) {
  console.error('❌ routes import failed:', error);
  process.exit(1);
}

try {
  console.log('🔄 Testing vite import...');
  const { setupVite, serveStatic, log } = await import('./vite');
  console.log('✅ vite imported successfully');
} catch (error) {
  console.error('❌ vite import failed:', error);
  process.exit(1);
}

try {
  console.log('🔄 Testing postingService import...');
  const { postingService } = await import('./postingService');
  console.log('✅ postingService imported successfully');
} catch (error) {
  console.error('❌ postingService import failed:', error);
  process.exit(1);
}

try {
  console.log('🔄 Testing env import...');
  const { validateEnv } = await import('./env');
  console.log('✅ env imported successfully');
} catch (error) {
  console.error('❌ env import failed:', error);
  process.exit(1);
}

try {
  console.log('🔄 Testing supabaseAuth import...');
  const { setupAuth } = await import('./supabaseAuth');
  console.log('✅ supabaseAuth imported successfully');
} catch (error) {
  console.error('❌ supabaseAuth import failed:', error);
  process.exit(1);
}

try {
  console.log('🔄 Testing progressTracker import...');
  const { progressTracker } = await import('./progressTracker');
  console.log('✅ progressTracker imported successfully');
} catch (error) {
  console.error('❌ progressTracker import failed:', error);
  process.exit(1);
}

console.log('🎉 All imports successful! Server should start normally.'); 