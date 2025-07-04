CREATE TABLE IF NOT EXISTS cta_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  name varchar NOT NULL,
  type varchar NOT NULL,
  url text NOT NULL,
  product jsonb,
  template text NOT NULL,
  platforms jsonb NOT NULL,
  timing varchar NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cta_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cta_id uuid NOT NULL REFERENCES cta_configs(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES social_posts(id),
  platform varchar NOT NULL,
  clicks integer DEFAULT 0,
  conversions integer DEFAULT 0,
  revenue numeric DEFAULT 0,
  date timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar NOT NULL,
  description text,
  owner_id varchar NOT NULL REFERENCES users(id),
  branding_config jsonb,
  settings jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id),
  role varchar NOT NULL,
  permissions jsonb,
  invited_by varchar REFERENCES users(id),
  joined_at timestamp DEFAULT now(),
  last_active timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  period varchar NOT NULL,
  date timestamp NOT NULL,
  metrics jsonb NOT NULL,
  costs jsonb NOT NULL
);
