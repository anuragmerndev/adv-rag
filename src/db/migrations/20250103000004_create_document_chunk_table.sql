-- Migration: Create document_chunk table with vector embeddings
-- Created: 2025-01-03

-- UP
CREATE TABLE IF NOT EXISTS document_chunk (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding VECTOR(1024) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_chunk_doc_id 
ON document_chunk(doc_id);

CREATE INDEX IF NOT EXISTS idx_document_chunk_created_at 
ON document_chunk(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_chunk_embedding_ivfflat 
ON document_chunk 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);