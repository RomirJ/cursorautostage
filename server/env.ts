export function validateEnv() {
  const required = [
    'OPENAI_API_KEY',
    'REDIS_HOST',
    'REDIS_PORT',
    'DATABASE_URL',
    'SESSION_SECRET',
    'STRIPE_SECRET_KEY',
    'YOUTUBE_CLIENT_ID',
    'YOUTUBE_CLIENT_SECRET',
    'YOUTUBE_REDIRECT_URI',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_ANON_KEY'
  ];

  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error('❌ Missing environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\n📝 Please set these environment variables:');
    console.error('   For Supabase:');
    console.error('   - SUPABASE_URL: Your Supabase project URL');
    console.error('   - SUPABASE_SERVICE_ROLE_KEY: Your Supabase service role key');
    console.error('   - SUPABASE_ANON_KEY: Your Supabase anon/public key');
    console.error('\n   For other services:');
    console.error('   - DATABASE_URL: Your database connection string');
    console.error('   - SESSION_SECRET: A random string for session encryption');
    console.error('   - REDIS_HOST, REDIS_PORT: Redis connection details');
    console.error('   - OPENAI_API_KEY: Your OpenAI API key');
    console.error('   - STRIPE_SECRET_KEY: Your Stripe secret key');
    console.error('   - YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REDIRECT_URI: YouTube OAuth credentials');
    
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }

  // Optional but recommended
  const optional = [
    'FRONTEND_URL',
    'NODE_ENV',
    'PORT',
    'ASSEMBLY_AI_API_KEY',
    'APOLLO_API_KEY'
  ];

  const missingOptional = optional.filter(key => !process.env[key]);
  if (missingOptional.length > 0) {
    console.warn('⚠️  Optional environment variables not set:');
    missingOptional.forEach(key => console.warn(`   - ${key}`));
  }
}
