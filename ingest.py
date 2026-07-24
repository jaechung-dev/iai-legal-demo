"""
Ingest case events into case_events table.
Usage: python ingest.py [case_id] [jsonl_file]
"""
import os, sys, json
import psycopg2
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

DSN     = os.environ["DATABASE_URL"]
case_id = sys.argv[1] if len(sys.argv) > 1 else "nguyen"
jsonl   = sys.argv[2] if len(sys.argv) > 2 else "cases/case_nguyen_v_r.jsonl"

client = OpenAI()

def embed(texts: list[str]) -> list[list[float]]:
    resp = client.embeddings.create(model="text-embedding-3-small", input=texts)
    return [d.embedding for d in resp.data]

with open(jsonl) as f:
    events = [json.loads(l) for l in f if l.strip()]

texts = [f"{e['subject']}. {e['summary']}. {e['content'][:500]}" for e in events]
print(f"Embedding {len(texts)} events (case_id='{case_id}')...")
vectors = embed(texts)
print(f"Done — dim={len(vectors[0])}")

conn = psycopg2.connect(DSN)
cur  = conn.cursor()
cur.execute("DELETE FROM case_events WHERE case_id = %s", (case_id,))

for e, vec in zip(events, vectors):
    vec_str = "[" + ",".join(str(x) for x in vec) + "]"
    cur.execute("""
        INSERT INTO case_events
            (case_id, date, category, event_type, subject, summary, content, attachments, embedding)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::vector)
    """, (
        case_id,
        e["date"], e["category"], e["event_type"],
        e["subject"], e["summary"], e["content"],
        json.dumps(e.get("attachments", [])), vec_str,
    ))
    print(f"  + {e['date']} {e['category']} — {e['subject'][:60]}")

conn.commit()
conn.close()
print(f"\nIngested {len(events)} events.")
