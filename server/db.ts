import { config } from 'dotenv';
config(); // Load environment variables from .env file

import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

// Check for DATABASE_URL in environment variables
let databaseUrl = process.env.DATABASE_URL;

// If not found, try common Replit database environment variables
if (!databaseUrl) {
  databaseUrl = process.env.REPLIT_DB_URL || 
                process.env.DB_URL || 
                process.env.POSTGRES_URL ||
                process.env.POSTGRESQL_URL;
}

// If still not found, provide a helpful error message
if (!databaseUrl) {
  console.error("❌ Database connection error:");
  console.error("DATABASE_URL environment variable is not set.");
  console.error("\nTo fix this in Replit:");
  console.error("1. Click the 'Secrets' tab (🔒 lock icon) in the sidebar");
  console.error("2. Add a new secret named 'DATABASE_URL'");
  console.error("3. Paste your PostgreSQL connection string as the value");
  console.error("4. Restart your Replit project");
  console.error("\nAlternatively, Replit should auto-provision this when PostgreSQL is enabled.");
  
  throw new Error(
    "DATABASE_URL must be set. Please check your Replit Secrets configuration."
  );
}

// Create pool with timeout and retry configuration
export const pool = new Pool({ 
  connectionString: databaseUrl,
  max: 20, // Maximum number of connections
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 10000, // Connection timeout of 10 seconds
  ssl: {
    rejectUnauthorized: false // Allow self-signed certificates
  }
});

// Test the connection
pool.on('connect', () => {
  console.log('✅ Database connection established');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

export const db = drizzle(pool, { schema });

// Test database connectivity
export async function testDatabaseConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connection test successful:', result.rows[0]);
    return true;
  } catch (error) {
    console.error('❌ Database connection test failed:', error);
    return false;
  }
}