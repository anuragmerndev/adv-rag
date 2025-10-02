-- Migration: Initialize pgvector extension
-- Created: 2025-01-03

-- UP
CREATE EXTENSION IF NOT EXISTS vector;

-- DOWN
DROP EXTENSION IF EXISTS vector;