"""
Legal Intelligence Demo API
Port 9300
"""
import os
import re, json, asyncio
from dotenv import load_dotenv
load_dotenv()
import requests
import psycopg2
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from langchain_core.embeddings import Embeddings
from langchain_core.retrievers import BaseRetriever
from langchain_core.callbacks import CallbackManagerForRetrieverRun
from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from langchain_ollama import ChatOllama
from pydantic import Field

# ── config ────────────────────────────────────────────────────────────────────

DSN       = os.getenv("DATABASE_URL", "host=127.0.0.1 port=5432 dbname=bella_legal user=postgres password=postgres")
EMBED_URL = os.getenv("EMBED_URL", "http://127.0.0.1:8100/v1/embed")
OLLAMA    = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
MODEL     = os.getenv("OLLAMA_MODEL", "qwen3.5:4b")

# ── embeddings ────────────────────────────────────────────────────────────────

class BgeM3Embeddings(Embeddings):
    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        r = requests.post(EMBED_URL, json={"texts": texts}, timeout=60)
        r.raise_for_status()
        return r.json()["vectors"]

    def embed_query(self, text: str) -> list[float]:
        return self.embed_documents([text])[0]

embedder = BgeM3Embeddings()

# ── retrievers ────────────────────────────────────────────────────────────────

class LegislationRetriever(BaseRetriever):
    k: int = Field(default=4)

    def _get_relevant_documents(
        self, query: str, *, run_manager: CallbackManagerForRetrieverRun
    ) -> list[Document]:
        vec = embedder.embed_query(query)
        vec_str = "[" + ",".join(str(x) for x in vec) + "]"
        conn = psycopg2.connect(DSN)
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT citation, text, 1 - (embedding <=> %s::vector) AS score
                FROM legislation_chunks
                WHERE embedding IS NOT NULL
                ORDER BY embedding <=> %s::vector
                LIMIT %s
            """, (vec_str, vec_str, self.k))
            rows = cur.fetchall()
        finally:
            conn.close()
        return [
            Document(page_content=r[1], metadata={"source": "legislation", "citation": r[0], "score": round(r[2], 4)})
            for r in rows
        ]


class CaselawRetriever(BaseRetriever):
    k: int = Field(default=4)

    def _get_relevant_documents(
        self, query: str, *, run_manager: CallbackManagerForRetrieverRun
    ) -> list[Document]:
        vec = embedder.embed_query(query)
        vec_str = "[" + ",".join(str(x) for x in vec) + "]"
        conn = psycopg2.connect(DSN)
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT case_name, text, 1 - (embedding <=> %s::vector) AS score
                FROM caselaw_chunks
                WHERE embedding IS NOT NULL
                ORDER BY embedding <=> %s::vector
                LIMIT %s
            """, (vec_str, vec_str, self.k))
            rows = cur.fetchall()
        finally:
            conn.close()
        return [
            Document(page_content=r[1], metadata={"source": "caselaw", "case_name": r[0], "score": round(r[2], 4)})
            for r in rows
        ]


class CaseEventRetriever(BaseRetriever):
    k: int = Field(default=5)
    case_id: str = Field(default="nguyen")

    def _get_relevant_documents(
        self, query: str, *, run_manager: CallbackManagerForRetrieverRun
    ) -> list[Document]:
        vec = embedder.embed_query(query)
        vec_str = "[" + ",".join(str(x) for x in vec) + "]"
        conn = psycopg2.connect(DSN)
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT date, category, event_type, subject, content,
                       1 - (embedding <=> %s::vector) AS score
                FROM demo_case_events
                WHERE case_id = %s AND embedding IS NOT NULL
                ORDER BY embedding <=> %s::vector
                LIMIT %s
            """, (vec_str, self.case_id, vec_str, self.k))
            rows = cur.fetchall()
        finally:
            conn.close()
        return [
            Document(
                page_content=f"[{r[1]} — {r[2]}] {r[3]}\n{r[4]}",
                metadata={"source": "case_event", "date": str(r[0]), "category": r[1], "score": round(r[5], 4)}
            )
            for r in rows
        ]

# ── LLM + chain ───────────────────────────────────────────────────────────────

llm = ChatOllama(model=MODEL, base_url=OLLAMA, temperature=0.1)

PROMPT = ChatPromptTemplate.from_messages([
    ("system",
     "You are a legal research assistant specialising in NSW law. "
     "Answer based only on the provided context. Be precise and cite sources. "
     "If the context does not contain enough information, say so clearly."),
    ("human", "Context:\n{context}\n\nQuestion: {question}"),
])

def format_docs(docs: list[Document]) -> str:
    parts = []
    for d in docs:
        src = d.metadata.get("citation") or d.metadata.get("case_name") or d.metadata.get("category", "")
        parts.append(f"[{src}]\n{d.page_content}")
    return "\n\n---\n\n".join(parts)

def strip_think(text: str) -> str:
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()

# ── FastAPI ───────────────────────────────────────────────────────────────────

app = FastAPI(title="Legal Intelligence Demo", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class SearchRequest(BaseModel):
    query: str
    source: str = "legislation"  # legislation | caselaw | case_events
    case_id: str = "nguyen"
    k: int = 5

class AskRequest(BaseModel):
    question: str
    source: str = "legislation"  # legislation | caselaw | both | case_events
    case_id: str = "nguyen"
    k: int = 4


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL}


@app.post("/search")
def search(req: SearchRequest):
    if req.source == "caselaw":
        retriever = CaselawRetriever(k=req.k)
    elif req.source == "case_events":
        retriever = CaseEventRetriever(k=req.k, case_id=req.case_id)
    else:
        retriever = LegislationRetriever(k=req.k)

    docs = retriever.invoke(req.query)
    return {
        "query": req.query,
        "source": req.source,
        "results": [
            {
                "content": d.page_content[:600],
                "metadata": d.metadata,
            }
            for d in docs
        ]
    }


@app.get("/case/{case_id}/timeline")
def timeline(case_id: str):
    conn = psycopg2.connect(DSN)
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT date, category, event_type, subject, summary, content, attachments
            FROM demo_case_events
            WHERE case_id = %s
            ORDER BY date ASC
        """, (case_id,))
        rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")

    return {
        "case_id": case_id,
        "total": len(rows),
        "events": [
            {
                "date": str(r[0]),
                "category": r[1],
                "event_type": r[2],
                "subject": r[3],
                "summary": r[4],
                "content": r[5],
                "attachments": r[6],
            }
            for r in rows
        ]
    }


@app.post("/ask")
async def ask(req: AskRequest):
    if req.source == "caselaw":
        retriever = CaselawRetriever(k=req.k)
    elif req.source == "case_events":
        retriever = CaseEventRetriever(k=req.k, case_id=req.case_id)
    elif req.source == "both":
        leg = LegislationRetriever(k=req.k // 2 + 1)
        cas = CaselawRetriever(k=req.k // 2 + 1)
        leg_docs = leg.invoke(req.question)
        cas_docs = cas.invoke(req.question)
        docs = leg_docs + cas_docs
        context = format_docs(docs)
        chain = PROMPT | llm | StrOutputParser()

        async def stream_both() -> AsyncIterator[str]:
            buffer = ""
            async for chunk in chain.astream({"context": context, "question": req.question}):
                buffer += chunk
                clean = strip_think(buffer)
                if clean:
                    yield f"data: {json.dumps({'text': chunk})}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(stream_both(), media_type="text/event-stream")
    else:
        retriever = LegislationRetriever(k=req.k)

    chain = (
        {"context": retriever | format_docs, "question": RunnablePassthrough()}
        | PROMPT
        | llm
        | StrOutputParser()
    )

    async def stream_response() -> AsyncIterator[str]:
        async for chunk in chain.astream(req.question):
            yield f"data: {json.dumps({'text': chunk})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream_response(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=20000, reload=False)
