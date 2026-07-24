-- PostgreSQL + pgvector schema for probonoai
-- Run once: psql $DATABASE_URL < schema.sql

CREATE EXTENSION IF NOT EXISTS vector;

-- Case timeline events
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

-- Legislation chunks
CREATE TABLE IF NOT EXISTS legislation_chunks (
    id           SERIAL PRIMARY KEY,
    citation     TEXT,
    jurisdiction TEXT DEFAULT 'NSW',
    text         TEXT,
    embedding    vector(1536)
);
CREATE INDEX IF NOT EXISTS legislation_chunks_embedding_idx ON legislation_chunks
    USING hnsw (embedding vector_cosine_ops);

-- Caselaw chunks
CREATE TABLE IF NOT EXISTS caselaw_chunks (
    id               SERIAL PRIMARY KEY,
    neutral_citation TEXT,
    title            TEXT,
    text             TEXT,
    embedding        vector(1536)
);
CREATE INDEX IF NOT EXISTS caselaw_chunks_embedding_idx ON caselaw_chunks
    USING hnsw (embedding vector_cosine_ops);

-- ── Auth tables ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email          TEXT UNIQUE NOT NULL,
    name           TEXT NOT NULL,
    password_hash  TEXT,
    salt           TEXT,
    role           TEXT NOT NULL DEFAULT 'user',
    provider       TEXT NOT NULL DEFAULT 'local',
    email_verified BOOLEAN NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_hash_idx    ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_expires_idx ON refresh_tokens(expires_at);

CREATE TABLE IF NOT EXISTS email_verifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used        BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_resets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used        BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── MCP tokens ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mcp_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   TEXT NOT NULL UNIQUE,
    name         TEXT NOT NULL DEFAULT 'My MCP Token',
    scopes       TEXT[] NOT NULL DEFAULT ARRAY['search','ask','fetch','collections'],
    expires_at   TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mcp_tokens_hash_idx    ON mcp_tokens(token_hash);
CREATE INDEX IF NOT EXISTS mcp_tokens_user_idx    ON mcp_tokens(user_id);
CREATE INDEX IF NOT EXISTS mcp_tokens_expires_idx ON mcp_tokens(expires_at);
