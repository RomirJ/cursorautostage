import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from "@shared/schema";

// For testing, use PostgreSQL with the same connection as production
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL || process.env.TEST_DATABASE_URL,
  max: 5, // Smaller pool for testing
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  ssl: {
    rejectUnauthorized: false
  }
});

// Create drizzle instance with PostgreSQL
export const db = drizzle(pool, { schema });

// Initialize test database with tables (PostgreSQL)
export async function initTestDatabase() {
  try {
    // Create tables if they don't exist (PostgreSQL syntax)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY NOT NULL,
        email TEXT,
        first_name TEXT,
        last_name TEXT,
        profile_image_url TEXT,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        subscription_status TEXT DEFAULT 'free',
        subscription_tier TEXT DEFAULT 'free',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS uploads (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        duration REAL,
        status TEXT DEFAULT 'uploaded' NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ab_tests (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        content_id TEXT NOT NULL,
        test_config TEXT NOT NULL,
        status TEXT DEFAULT 'running' NOT NULL,
        winner_variation_id TEXT,
        results TEXT,
        confidence REAL,
        total_engagement INTEGER DEFAULT 0,
        test_duration INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS social_posts (
        id TEXT PRIMARY KEY NOT NULL,
        segment_id TEXT,
        platform TEXT NOT NULL,
        content TEXT NOT NULL,
        scheduled_for TIMESTAMP,
        posted_at TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'draft',
        engagement TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    console.log('✅ Test database initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize test database:', error);
    throw error;
  }
}

// Clean up test database
export async function cleanupTestDatabase() {
  try {
    await pool.end();
    console.log('✅ Test database cleaned up');
  } catch (error) {
    console.error('❌ Failed to cleanup test database:', error);
  }
} 