import { defineConfig } from "drizzle-kit";

// Get database URL from environment
const databaseUrl = process.env.DATABASE_URL;

// Validate database URL
if (!databaseUrl) {
  console.error("❌ DATABASE_URL environment variable is required");
  console.error("Please set DATABASE_URL in your .env file");
  process.exit(1);
}

// Validate that it's a PostgreSQL URL
if (!databaseUrl.startsWith("postgres://") && !databaseUrl.startsWith("postgresql://")) {
  console.error("❌ DATABASE_URL must be a PostgreSQL connection string");
  console.error("Expected format: postgres://user:password@host:port/database");
  process.exit(1);
}

console.log("✅ Using PostgreSQL database:", databaseUrl.replace(/\/\/.*@/, "//***:***@"));

export default defineConfig({
  schema: "./shared/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
  // Use public schema for Supabase/PostgreSQL compatibility
  schemaFilter: ["public"],
});