-- Migration: Create user table
-- Created: 2025-01-03

-- UP
CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  clerk_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email ON "user"(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_clerk_id ON "user"(clerk_id) WHERE clerk_id IS NOT NULL;

-- DOWN
DROP TABLE IF EXISTS "user" CASCADE;
