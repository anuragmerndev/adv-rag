-- Migration: Create user table
-- Created: 2025-01-03

-- UP
CREATE TABLE IF NOT EXISTS "user" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email 
ON "user"(email);

-- DOWN
DROP TABLE IF EXISTS "user" CASCADE;