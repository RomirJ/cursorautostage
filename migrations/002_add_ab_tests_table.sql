-- Migration: Add A/B Tests Table
-- Date: 2024-01-XX
-- Description: Adds support for A/B testing functionality

CREATE TABLE IF NOT EXISTS ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  content_id UUID NOT NULL REFERENCES uploads(id),
  test_config JSONB NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'running',
  winner_variation_id VARCHAR,
  results JSONB,
  confidence NUMERIC,
  total_engagement INTEGER DEFAULT 0,
  test_duration INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_ab_tests_user_id ON ab_tests(user_id);
CREATE INDEX IF NOT EXISTS idx_ab_tests_content_id ON ab_tests(content_id);
CREATE INDEX IF NOT EXISTS idx_ab_tests_status ON ab_tests(status);
CREATE INDEX IF NOT EXISTS idx_ab_tests_created_at ON ab_tests(created_at);

-- Add comments for documentation
COMMENT ON TABLE ab_tests IS 'Stores A/B test configurations and results';
COMMENT ON COLUMN ab_tests.test_config IS 'JSON configuration including variations, platforms, duration, etc.';
COMMENT ON COLUMN ab_tests.results IS 'JSON results from the A/B test including performance metrics';
COMMENT ON COLUMN ab_tests.confidence IS 'Statistical confidence level of the test results';
COMMENT ON COLUMN ab_tests.test_duration IS 'Duration of the test in milliseconds'; 