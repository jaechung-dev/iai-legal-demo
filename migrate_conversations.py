"""
Migration script: create conversations and conversation_messages tables.
Run once: python migrate_conversations.py
"""
import os
import sys

# Load .env if present
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # Parse .env manually
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    os.environ.setdefault(k.strip(), v.strip())

import psycopg2

DSN = os.getenv("DATABASE_URL", "")
if not DSN:
    print("ERROR: DATABASE_URL not set", file=sys.stderr)
    sys.exit(1)

SQL = """
CREATE TABLE IF NOT EXISTS conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT 'New conversation',
  case_id     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
  ON conversations(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content         TEXT NOT NULL,
  sources         JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_messages_conv_id
  ON conversation_messages(conversation_id, created_at ASC);
"""

print("Connecting to database...")
conn = psycopg2.connect(DSN)
try:
    cur = conn.cursor()
    cur.execute(SQL)
    conn.commit()
    print("Migration complete: conversations and conversation_messages tables created (if not exist).")
finally:
    conn.close()
