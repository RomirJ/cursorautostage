-- Advanced Infrastructure Migration
-- Adds comprehensive compliance, copyright protection, encryption, multi-region, and backup systems

-- Compliance and Data Protection Tables

CREATE TABLE IF NOT EXISTS data_export_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('gdpr', 'ccpa', 'full_export')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  requested_data TEXT[] NOT NULL,
  export_url TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX idx_data_export_requests_user_id ON data_export_requests(user_id);
CREATE INDEX idx_data_export_requests_status ON data_export_requests(status);
CREATE INDEX idx_data_export_requests_expires_at ON data_export_requests(expires_at);

CREATE TABLE IF NOT EXISTS data_erasure_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('gdpr_erasure', 'ccpa_deletion', 'account_deletion')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'processing', 'completed', 'failed')),
  verification_token TEXT NOT NULL,
  verification_expires_at TIMESTAMP NOT NULL,
  data_types TEXT[] NOT NULL,
  retention_period INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX idx_data_erasure_requests_user_id ON data_erasure_requests(user_id);
CREATE INDEX idx_data_erasure_requests_status ON data_erasure_requests(status);
CREATE INDEX idx_data_erasure_requests_verification_token ON data_erasure_requests(verification_token);

CREATE TABLE IF NOT EXISTS consent_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,
  granted BOOLEAN NOT NULL,
  version TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP,
  withdrawn_at TIMESTAMP
);

CREATE INDEX idx_consent_records_user_id ON consent_records(user_id);
CREATE INDEX idx_consent_records_consent_type ON consent_records(consent_type);
CREATE INDEX idx_consent_records_timestamp ON consent_records(timestamp);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  details JSONB,
  ip_address TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  category TEXT NOT NULL CHECK (category IN ('data_access', 'data_modification', 'data_deletion', 'authentication', 'authorization', 'system'))
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_severity ON audit_logs(severity);
CREATE INDEX idx_audit_logs_category ON audit_logs(category);

-- Copyright Protection Tables

CREATE TABLE IF NOT EXISTS content_fingerprints (
  id TEXT PRIMARY KEY,
  upload_id TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('video', 'audio', 'image', 'text')),
  perceptual_hash TEXT NOT NULL,
  audio_fingerprint TEXT,
  video_fingerprint TEXT,
  text_hash TEXT,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  duration INTEGER,
  resolution TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_content_fingerprints_upload_id ON content_fingerprints(upload_id);
CREATE INDEX idx_content_fingerprints_user_id ON content_fingerprints(user_id);
CREATE INDEX idx_content_fingerprints_perceptual_hash ON content_fingerprints(perceptual_hash);
CREATE INDEX idx_content_fingerprints_content_type ON content_fingerprints(content_type);

CREATE TABLE IF NOT EXISTS copyright_claims (
  id TEXT PRIMARY KEY,
  claimant_id TEXT NOT NULL,
  content_id TEXT NOT NULL,
  claim_type TEXT NOT NULL CHECK (claim_type IN ('copyright', 'trademark', 'dmca')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'approved', 'rejected', 'resolved')),
  evidence JSONB NOT NULL,
  target_content JSONB NOT NULL,
  resolution JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP
);

CREATE INDEX idx_copyright_claims_claimant_id ON copyright_claims(claimant_id);
CREATE INDEX idx_copyright_claims_content_id ON copyright_claims(content_id);
CREATE INDEX idx_copyright_claims_status ON copyright_claims(status);
CREATE INDEX idx_copyright_claims_claim_type ON copyright_claims(claim_type);

CREATE TABLE IF NOT EXISTS blocked_hashes (
  hash TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  added_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_blocked_hashes_added_at ON blocked_hashes(added_at);

-- Encryption Keys Table

CREATE TABLE IF NOT EXISTS encryption_keys (
  id TEXT PRIMARY KEY,
  key_data TEXT NOT NULL,
  algorithm TEXT NOT NULL,
  key_size INTEGER NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('token_encryption', 'data_encryption', 'backup_encryption')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'rotated', 'expired')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP
);

CREATE INDEX idx_encryption_keys_purpose ON encryption_keys(purpose);
CREATE INDEX idx_encryption_keys_status ON encryption_keys(status);
CREATE INDEX idx_encryption_keys_expires_at ON encryption_keys(expires_at);

-- Multi-Region Infrastructure Tables

CREATE TABLE IF NOT EXISTS regions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  location JSONB NOT NULL,
  endpoints JSONB NOT NULL,
  capacity JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'degraded', 'offline')),
  health_check JSONB NOT NULL,
  data_residency JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_regions_code ON regions(code);
CREATE INDEX idx_regions_status ON regions(status);

CREATE TABLE IF NOT EXISTS user_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_region TEXT NOT NULL REFERENCES regions(code) ON DELETE RESTRICT,
  original_region TEXT NOT NULL,
  routing_decision JSONB NOT NULL,
  performance JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_assigned_region ON user_sessions(assigned_region);
CREATE INDEX idx_user_sessions_created_at ON user_sessions(created_at);

-- Backup and Recovery Tables

CREATE TABLE IF NOT EXISTS backup_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('full', 'incremental', 'differential', 'snapshot')),
  schedule JSONB NOT NULL,
  retention JSONB NOT NULL,
  targets JSONB NOT NULL,
  destinations JSONB NOT NULL,
  notifications JSONB NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_backup_configs_enabled ON backup_configs(enabled);
CREATE INDEX idx_backup_configs_type ON backup_configs(type);

CREATE TABLE IF NOT EXISTS backup_jobs (
  id TEXT PRIMARY KEY,
  config_id TEXT NOT NULL REFERENCES backup_configs(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('full', 'incremental', 'differential', 'snapshot')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  start_time TIMESTAMP NOT NULL DEFAULT NOW(),
  end_time TIMESTAMP,
  duration INTEGER,
  size BIGINT NOT NULL DEFAULT 0,
  files_count INTEGER NOT NULL DEFAULT 0,
  checksum TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL,
  destinations JSONB NOT NULL,
  error JSONB,
  logs TEXT[]
);

CREATE INDEX idx_backup_jobs_config_id ON backup_jobs(config_id);
CREATE INDEX idx_backup_jobs_status ON backup_jobs(status);
CREATE INDEX idx_backup_jobs_start_time ON backup_jobs(start_time);
CREATE INDEX idx_backup_jobs_type ON backup_jobs(type);

CREATE TABLE IF NOT EXISTS recovery_points (
  id TEXT PRIMARY KEY,
  backup_job_id TEXT NOT NULL REFERENCES backup_jobs(id) ON DELETE CASCADE,
  timestamp TIMESTAMP NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('full', 'incremental')),
  size BIGINT NOT NULL,
  checksum TEXT NOT NULL,
  dependencies TEXT[],
  metadata JSONB NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  verification_date TIMESTAMP
);

CREATE INDEX idx_recovery_points_backup_job_id ON recovery_points(backup_job_id);
CREATE INDEX idx_recovery_points_timestamp ON recovery_points(timestamp);
CREATE INDEX idx_recovery_points_type ON recovery_points(type);
CREATE INDEX idx_recovery_points_verified ON recovery_points(verified);

CREATE TABLE IF NOT EXISTS restore_jobs (
  id TEXT PRIMARY KEY,
  recovery_point_id TEXT NOT NULL REFERENCES recovery_points(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('full', 'partial', 'point_in_time')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  target_environment TEXT NOT NULL CHECK (target_environment IN ('production', 'staging', 'development', 'custom')),
  restore_targets JSONB NOT NULL,
  options JSONB NOT NULL,
  progress JSONB NOT NULL,
  start_time TIMESTAMP NOT NULL DEFAULT NOW(),
  end_time TIMESTAMP,
  error JSONB,
  logs TEXT[]
);

CREATE INDEX idx_restore_jobs_recovery_point_id ON restore_jobs(recovery_point_id);
CREATE INDEX idx_restore_jobs_status ON restore_jobs(status);
CREATE INDEX idx_restore_jobs_start_time ON restore_jobs(start_time);
CREATE INDEX idx_restore_jobs_target_environment ON restore_jobs(target_environment);

-- Update migration history
INSERT INTO migration_history (id, migration_name, version, checksum) 
VALUES (
  '005',
  'add_advanced_infrastructure',
  '1.0.0',
  'advanced_infrastructure_v1_0_0'
) ON CONFLICT (id) DO NOTHING; 