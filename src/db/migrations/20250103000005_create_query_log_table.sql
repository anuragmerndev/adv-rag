-- Migration: Create query_log table
-- Created: 2025-01-03

-- UP
CREATE TABLE IF NOT EXISTS query_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  response TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_query_log_created_at 
ON query_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_query_log_embedding_ivfflat 
ON query_log 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 50);

-- DOWN
DROP TABLE IF EXISTS query_log CASCADE;