-- Neon / PostgreSQL schema for iai-legal-demo
-- Run once: psql $DATABASE_URL < schema.sql

CREATE EXTENSION IF NOT EXISTS vector;

-- Case timeline events (demo data)
CREATE TABLE IF NOT EXISTS demo_case_events (
    id           SERIAL PRIMARY KEY,
    case_id      TEXT NOT NULL,
    date         DATE NOT NULL,
    category     TEXT,
    event_type   TEXT,
    subject      TEXT,
    summary      TEXT,
    content      TEXT,
    attachments  JSONB DEFAULT '[]',
    embedding    vector(1536)
);
CREATE INDEX IF NOT EXISTS demo_case_events_case_id_idx ON demo_case_events (case_id);
CREATE INDEX IF NOT EXISTS demo_case_events_embedding_idx ON demo_case_events
    USING hnsw (embedding vector_cosine_ops);

-- Legislation chunks (demo subset)
CREATE TABLE IF NOT EXISTS legislation_chunks (
    id           SERIAL PRIMARY KEY,
    citation     TEXT,
    jurisdiction TEXT DEFAULT 'NSW',
    text         TEXT,
    embedding    vector(1536)
);
CREATE INDEX IF NOT EXISTS legislation_chunks_embedding_idx ON legislation_chunks
    USING hnsw (embedding vector_cosine_ops);

-- Caselaw chunks (demo subset)
CREATE TABLE IF NOT EXISTS caselaw_chunks (
    id               SERIAL PRIMARY KEY,
    neutral_citation TEXT,
    title            TEXT,
    text             TEXT,
    embedding        vector(1536)
);
CREATE INDEX IF NOT EXISTS caselaw_chunks_embedding_idx ON caselaw_chunks
    USING hnsw (embedding vector_cosine_ops);
