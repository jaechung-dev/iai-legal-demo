"""
Ingest a subset of legislation or caselaw chunks from a JSONL export.
Usage:
  python ingest_law.py legislation  demo_data/legislation_demo.jsonl
  python ingest_law.py caselaw      demo_data/caselaw_demo.jsonl

Export from server (run on gom@192.168.0.28):
  # Legislation — fraud/criminal/legal profession acts, 500 chunks
  psql -d bella_legal -c "COPY (
    SELECT citation, jurisdiction, text FROM legislation_chunks
    WHERE embedding IS NOT NULL
      AND (citation ILIKE '%Crimes Act%'
        OR citation ILIKE '%Legal Profession%'
        OR citation ILIKE '%Criminal Procedure%'
        OR citation ILIKE '%Evidence Act%'
        OR citation ILIKE '%Civil Liability%')
    ORDER BY random() LIMIT 500
  ) TO STDOUT WITH CSV HEADER" > legislation_demo.csv

  # Caselaw — 300 chunks
  psql -d bella_legal -c "COPY (
    SELECT neutral_citation, title, text FROM caselaw_chunks
    WHERE embedding IS NOT NULL
    ORDER BY random() LIMIT 300
  ) TO STDOUT WITH CSV HEADER" > caselaw_demo.csv

Then convert CSV to JSONL and scp here, or use the --csv flag below.
"""
import os, sys, json, csv
import psycopg2
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

BATCH  = 100
DSN    = os.environ["DATABASE_URL"]
table  = sys.argv[1] if len(sys.argv) > 1 else "legislation"   # legislation | caselaw
infile = sys.argv[2] if len(sys.argv) > 2 else None
if not infile:
    print(__doc__)
    sys.exit(1)

client = OpenAI()

def embed_batch(texts: list[str]) -> list[list[float]]:
    resp = client.embeddings.create(model="text-embedding-3-small", input=texts)
    return [d.embedding for d in resp.data]

# ── load rows ─────────────────────────────────────────────────────────────────

rows = []
if infile.endswith(".csv"):
    with open(infile, newline="") as f:
        rows = list(csv.DictReader(f))
else:
    with open(infile) as f:
        rows = [json.loads(l) for l in f if l.strip()]

print(f"Loaded {len(rows)} rows from {infile}")

# ── embed + insert ────────────────────────────────────────────────────────────

conn = psycopg2.connect(DSN)
cur  = conn.cursor()
total = 0

for i in range(0, len(rows), BATCH):
    batch = rows[i:i + BATCH]
    texts = [r.get("text", "")[:1000] for r in batch]
    vecs  = embed_batch(texts)

    for r, vec in zip(batch, vecs):
        vec_str = "[" + ",".join(str(x) for x in vec) + "]"
        if table == "legislation":
            cur.execute("""
                INSERT INTO legislation_chunks (citation, jurisdiction, text, embedding)
                VALUES (%s, %s, %s, %s::vector)
            """, (r.get("citation", ""), r.get("jurisdiction", "NSW"), r.get("text", ""), vec_str))
        else:
            cur.execute("""
                INSERT INTO caselaw_chunks (neutral_citation, title, text, embedding)
                VALUES (%s, %s, %s, %s::vector)
            """, (r.get("neutral_citation", ""), r.get("title", ""), r.get("text", ""), vec_str))

    conn.commit()
    total += len(batch)
    print(f"  [{total}/{len(rows)}] batch done")

conn.close()
print(f"\nIngested {total} rows into {table}_chunks.")
