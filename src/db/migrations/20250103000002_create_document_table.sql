-- Migration: Create document table
-- Created: 2025-01-03

-- UP
CREATE TABLE IF NOT EXISTS document (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_document_created_at 
ON document(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_is_deleted 
ON document(is_deleted) 
WHERE is_deleted = false;

-- DOWN
DROP TABLE IF EXISTS document CASCADE;