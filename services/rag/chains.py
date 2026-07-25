"""
LangChain LCEL chains and streaming generators for the legal RAG pipeline.

Provider selection: set CHAT_MODEL in .env.
  gpt-4o-mini          → OpenAI  (default)
  claude-haiku-4-5     → Anthropic
"""
import os
import re
import json
import time
import asyncio
import logging
from typing import AsyncIterator

from langchain_core.documents import Document
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from langchain_openai import ChatOpenAI

from services.rag.prompts import PROMPT, PLAIN_ENGLISH_SYSTEM
from services.rag.retrievers import (
    LegislationRetriever,
    CaselawRetriever,
    CaseEventRetriever,
)

logger = logging.getLogger(__name__)

CHAT_MODEL = os.getenv("CHAT_MODEL", "gpt-4o-mini")

# ── LLM provider ──────────────────────────────────────────────────────────────

if CHAT_MODEL.startswith("claude-"):
    from langchain_anthropic import ChatAnthropic
    llm = ChatAnthropic(model=CHAT_MODEL, temperature=0.1, max_tokens=2048)
else:
    llm = ChatOpenAI(model=CHAT_MODEL, temperature=0.1, streaming=True)

# ── Shared helpers ─────────────────────────────────────────────────────────────


def format_docs(docs: list[Document]) -> str:
    """Concatenate retrieved docs into a single context string with citation headers."""
    parts = []
    for d in docs:
        src = (
            d.metadata.get("citation")
            or d.metadata.get("case_name")
            or d.metadata.get("category", "")
        )
        parts.append(f"[{src}]\n{d.page_content}")
    return "\n\n---\n\n".join(parts)


def strip_think(text: str) -> str:
    """Remove <think>…</think> blocks emitted by reasoning models."""
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


# ── /ask streaming generators ─────────────────────────────────────────────────


async def stream_single(
    retriever,
    question: str,
    log_request_fn,
    user: str,
    source: str,
    k: int,
) -> AsyncIterator[str]:
    """
    Stream SSE tokens for a single-retriever /ask request.
    Yields ``data: {...}`` lines terminated with ``data: [DONE]``.
    """
    chain = (
        {"context": retriever | format_docs, "question": RunnablePassthrough()}
        | PROMPT
        | llm
        | StrOutputParser()
    )
    full_text = ""
    chunks = 0
    t0 = time.time()
    async for chunk in chain.astream(question):
        full_text += chunk
        chunks += 1
        yield f"data: {json.dumps({'text': chunk})}\n\n"
    elapsed_ms = round((time.time() - t0) * 1000)
    logger.info(
        "ask question=%r source=%s k=%d user=%s elapsed_ms=%d chunks=%d",
        question[:120], source, k, user, elapsed_ms, chunks,
    )
    yield "data: [DONE]\n\n"
    asyncio.create_task(log_request_fn(
        endpoint="/ask",
        user_id=user,
        input_data={"question": question, "source": source, "k": k},
        output_data={"answer": strip_think(full_text)},
        elapsed_ms=elapsed_ms,
    ))


async def stream_both(
    leg_docs: list[Document],
    cas_docs: list[Document],
    question: str,
    log_request_fn,
    user: str,
    source: str,
    k: int,
) -> AsyncIterator[str]:
    """
    Stream SSE tokens for a dual-retriever (legislation + caselaw) /ask request.
    Accepts already-fetched doc lists so the caller controls retrieval.
    """
    docs = leg_docs + cas_docs
    context = format_docs(docs)
    chain = PROMPT | llm | StrOutputParser()

    buffer = ""
    chunks = 0
    t0 = time.time()
    async for chunk in chain.astream({"context": context, "question": question}):
        buffer += chunk
        chunks += 1
        clean = strip_think(buffer)
        if clean:
            yield f"data: {json.dumps({'text': chunk})}\n\n"
    elapsed_ms = round((time.time() - t0) * 1000)
    logger.info(
        "ask question=%r source=%s k=%d user=%s elapsed_ms=%d chunks=%d",
        question[:120], source, k, user, elapsed_ms, chunks,
    )
    yield "data: [DONE]\n\n"
    asyncio.create_task(log_request_fn(
        endpoint="/ask",
        user_id=user,
        input_data={"question": question, "source": source, "k": k},
        output_data={"answer": strip_think(buffer)},
        elapsed_ms=elapsed_ms,
    ))


async def stream_chat(
    lc_messages: list,
    sources: list[dict],
    question: str,
    messages_raw: list,
    case_id: str,
    k: int,
    log_request_fn,
    user: str,
) -> AsyncIterator[str]:
    """
    Stream SSE events for the /chat endpoint.
    Yields a ``sources`` event first, then ``token`` events, then [DONE].
    """
    yield f"data: {json.dumps({'type': 'sources', 'docs': sources})}\n\n"
    buffer = ""
    chunks = 0
    t0 = time.time()
    async for chunk in llm.astream(lc_messages):
        token = chunk.content if hasattr(chunk, "content") else str(chunk)
        buffer += token
        chunks += 1
        before = strip_think(buffer[:-len(token)] if len(token) <= len(buffer) else "")
        after = strip_think(buffer)
        new_text = after[len(before):]
        if new_text:
            yield f"data: {json.dumps({'type': 'token', 'text': new_text})}\n\n"
    elapsed_ms = round((time.time() - t0) * 1000)
    logger.info(
        "chat question=%r messages=%d case_id=%s user=%s elapsed_ms=%d chunks=%d",
        question[:120], len(messages_raw), case_id, user, elapsed_ms, chunks,
    )
    yield "data: [DONE]\n\n"
    asyncio.create_task(log_request_fn(
        endpoint="/chat",
        user_id=user,
        input_data={
            "question": question,
            "messages": messages_raw,
            "case_id": case_id,
            "k": k,
        },
        output_data={"answer": strip_think(buffer)},
        elapsed_ms=elapsed_ms,
    ))
