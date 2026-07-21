import os
from dotenv import load_dotenv
load_dotenv()
import sys, json, requests, psycopg2

DSN      = os.getenv("DATABASE_URL", "host=127.0.0.1 port=5432 dbname=bella_legal user=postgres password=postgres")
EMBED_API = os.getenv("EMBED_URL", "http://127.0.0.1:8100/v1/embed")
case_id  = sys.argv[1] if len(sys.argv) > 1 else "nguyen"
jsonl    = sys.argv[2] if len(sys.argv) > 2 else "/home/gom/iai/demo/case_nguyen_v_r.jsonl"

def embed(texts):
    r = requests.post(EMBED_API, json={"texts": texts}, timeout=60)
    r.raise_for_status()
    return r.json()["vectors"]

with open(jsonl) as f:
    events = [json.loads(l) for l in f]

texts = [f"{e['subject']}. {e['summary']}. {e['content'][:500]}" for e in events]
print(f"Embedding {len(texts)} events for case_id='{case_id}'...")
vectors = embed(texts)
print(f"Done. dim={len(vectors[0])}")

conn = psycopg2.connect(DSN)
cur  = conn.cursor()
cur.execute("DELETE FROM demo_case_events WHERE case_id = %s", (case_id,))

for e, vec in zip(events, vectors):
    vec_str = "[" + ",".join(str(x) for x in vec) + "]"
    cur.execute("""
        INSERT INTO demo_case_events
            (case_id, date, category, event_type, subject, summary, content, attachments, embedding)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::vector)
    """, (
        case_id,
        e["date"], e["category"], e["event_type"],
        e["subject"], e["summary"], e["content"],
        json.dumps(e["attachments"]), vec_str
    ))
    print(f"  ✓ {e['date']} {e['category']} — {e['subject'][:60]}")

conn.commit()
conn.close()
print(f"\nIngested {len(events)} events into demo_case_events (case_id='{case_id}').")
