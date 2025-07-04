-- Migration: Add Perfect Features (Tax Reporting, White Label, Apollo API)
-- Created: 2024-01-XX

-- Tax Reporting Tables
CREATE TABLE IF NOT EXISTS tax_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL REFERENCES users(id),
    business_type VARCHAR NOT NULL,
    tax_year INTEGER NOT NULL,
    jurisdiction VARCHAR NOT NULL,
    state_province VARCHAR,
    tax_id VARCHAR,
    business_name VARCHAR,
    address JSONB,
    accounting_method VARCHAR NOT NULL,
    fiscal_year_end VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS taxable_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL REFERENCES users(id),
    type VARCHAR NOT NULL, -- 'revenue', 'expense', 'deduction'
    category VARCHAR NOT NULL,
    amount NUMERIC NOT NULL,
    currency VARCHAR DEFAULT 'USD',
    date TIMESTAMP NOT NULL,
    description TEXT NOT NULL,
    platform VARCHAR,
    invoice_number VARCHAR,
    receipt_url VARCHAR,
    tax_deductible BOOLEAN DEFAULT false,
    business_purpose TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- White Label Tables
CREATE TABLE IF NOT EXISTS white_label_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL REFERENCES users(id),
    client_id VARCHAR NOT NULL UNIQUE,
    brand_name VARCHAR NOT NULL,
    domain VARCHAR NOT NULL UNIQUE,
    custom_domain VARCHAR,
    branding JSONB NOT NULL,
    features JSONB NOT NULL,
    billing JSONB NOT NULL,
    limits JSONB NOT NULL,
    settings JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS white_label_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id VARCHAR NOT NULL,
    email VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    role VARCHAR NOT NULL, -- 'admin', 'user', 'viewer'
    status VARCHAR NOT NULL, -- 'active', 'pending', 'suspended'
    limits JSONB NOT NULL,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS domain_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain VARCHAR NOT NULL UNIQUE,
    client_id VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Apollo/Sponsorship Tables
CREATE TABLE IF NOT EXISTS prospects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL REFERENCES users(id),
    name VARCHAR NOT NULL,
    email VARCHAR NOT NULL,
    title VARCHAR NOT NULL,
    company JSONB NOT NULL,
    social_profiles JSONB,
    contact_info JSONB NOT NULL,
    sponsorship_history JSONB,
    relevance_score NUMERIC DEFAULT 0,
    match_reason JSONB,
    last_updated TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sponsorship_intelligence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prospect_id UUID NOT NULL REFERENCES prospects(id),
    insights JSONB NOT NULL,
    recommendations JSONB NOT NULL,
    outreach_templates JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outreach_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(id),
    prospects JSONB NOT NULL,
    template JSONB NOT NULL,
    schedule JSONB NOT NULL,
    status VARCHAR NOT NULL, -- 'draft', 'active', 'paused', 'completed'
    metrics JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prospect_searches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL REFERENCES users(id),
    criteria JSONB NOT NULL,
    results JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tax_configurations_user_id ON tax_configurations(user_id);
CREATE INDEX IF NOT EXISTS idx_tax_configurations_tax_year ON tax_configurations(tax_year);
CREATE INDEX IF NOT EXISTS idx_taxable_transactions_user_id ON taxable_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_taxable_transactions_date ON taxable_transactions(date);
CREATE INDEX IF NOT EXISTS idx_taxable_transactions_type ON taxable_transactions(type);

CREATE INDEX IF NOT EXISTS idx_white_label_configs_user_id ON white_label_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_white_label_configs_client_id ON white_label_configs(client_id);
CREATE INDEX IF NOT EXISTS idx_white_label_configs_domain ON white_label_configs(domain);
CREATE INDEX IF NOT EXISTS idx_white_label_users_client_id ON white_label_users(client_id);
CREATE INDEX IF NOT EXISTS idx_domain_mappings_domain ON domain_mappings(domain);

CREATE INDEX IF NOT EXISTS idx_prospects_user_id ON prospects(user_id);
CREATE INDEX IF NOT EXISTS idx_prospects_email ON prospects(email);
CREATE INDEX IF NOT EXISTS idx_prospects_relevance_score ON prospects(relevance_score);
CREATE INDEX IF NOT EXISTS idx_sponsorship_intelligence_prospect_id ON sponsorship_intelligence(prospect_id);
CREATE INDEX IF NOT EXISTS idx_outreach_campaigns_user_id ON outreach_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_outreach_campaigns_status ON outreach_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_prospect_searches_user_id ON prospect_searches(user_id);

-- Add comments for documentation
COMMENT ON TABLE tax_configurations IS 'Tax configuration settings for users';
COMMENT ON TABLE taxable_transactions IS 'All taxable transactions for tax reporting';
COMMENT ON TABLE white_label_configs IS 'White label client configurations';
COMMENT ON TABLE white_label_users IS 'Users within white label client instances';
COMMENT ON TABLE domain_mappings IS 'Domain to client ID mappings for white label';
COMMENT ON TABLE prospects IS 'Sponsorship prospects from Apollo API';
COMMENT ON TABLE sponsorship_intelligence IS 'AI-generated sponsorship insights for prospects';
COMMENT ON TABLE outreach_campaigns IS 'Outreach campaigns for prospect engagement';
COMMENT ON TABLE prospect_searches IS 'Saved prospect search results and criteria'; 