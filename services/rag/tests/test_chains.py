"""
Smoke tests for services/rag/chains.py

No real LLM or DB calls — OpenAI SDK and psycopg2 are mocked at import time.
"""
import re
import unittest
from unittest.mock import MagicMock, patch


def _stub_embeddings(*args, **kwargs):
    m = MagicMock()
    m.embed_query.return_value = [0.0] * 1536
    return m


def _stub_chat_openai(*args, **kwargs):
    m = MagicMock()
    m.__class__.__name__ = "ChatOpenAI"
    return m


# We need psycopg2 mocked before the retrievers module (imported by chains) tries to connect.
_PSYCOPG2_PATCH = patch("psycopg2.connect", side_effect=Exception("no db in tests"))
_EMBED_PATCH = patch("langchain_openai.OpenAIEmbeddings", side_effect=_stub_embeddings)
_LLM_PATCH = patch("langchain_openai.ChatOpenAI", side_effect=_stub_chat_openai)


class TestLLMInitialised(unittest.TestCase):
    """get_llm() should return a ChatOpenAI (or ChatAnthropic) instance."""

    def test_llm_exists(self):
        with _EMBED_PATCH, _PSYCOPG2_PATCH, _LLM_PATCH:
            import importlib
            import services.rag.chains as _chains_mod
            importlib.reload(_chains_mod)
            _chains_mod._llm = None  # reset lazy cache so the patch takes effect
            self.assertIsNotNone(_chains_mod.get_llm())

    def test_llm_is_chat_model(self):
        with _EMBED_PATCH, _PSYCOPG2_PATCH, _LLM_PATCH:
            import importlib
            import services.rag.chains as _chains_mod
            importlib.reload(_chains_mod)
            _chains_mod._llm = None
            name = type(_chains_mod.get_llm()).__name__
            self.assertIn(
                name,
                ("ChatOpenAI", "ChatAnthropic", "MagicMock"),
                f"Unexpected llm type: {name}",
            )


class TestFormatDocs(unittest.TestCase):
    """format_docs should concatenate doc content with citation headers."""

    def _make_doc(self, content, citation):
        from langchain_core.documents import Document
        return Document(page_content=content, metadata={"citation": citation, "source": "test"})

    def test_returns_non_empty_string(self):
        with _EMBED_PATCH, _PSYCOPG2_PATCH, _LLM_PATCH:
            import importlib
            import services.rag.chains as c
            importlib.reload(c)
            docs = [
                self._make_doc("Section 7 of the Bail Act …", "Bail Act 2013 s 7"),
                self._make_doc("The court held that …", "R v Smith [2019] NSWSC 42"),
            ]
            result = c.format_docs(docs)
        self.assertIsInstance(result, str)
        self.assertTrue(result)

    def test_includes_citations(self):
        with _EMBED_PATCH, _PSYCOPG2_PATCH, _LLM_PATCH:
            import importlib
            import services.rag.chains as c
            importlib.reload(c)
            docs = [self._make_doc("Some content.", "Bail Act 2013 s 7")]
            result = c.format_docs(docs)
        self.assertIn("Bail Act 2013 s 7", result)

    def test_includes_page_content(self):
        with _EMBED_PATCH, _PSYCOPG2_PATCH, _LLM_PATCH:
            import importlib
            import services.rag.chains as c
            importlib.reload(c)
            docs = [self._make_doc("Unique content xyz123.", "Ref")]
            result = c.format_docs(docs)
        self.assertIn("Unique content xyz123.", result)

    def test_empty_list_returns_empty_string(self):
        with _EMBED_PATCH, _PSYCOPG2_PATCH, _LLM_PATCH:
            import importlib
            import services.rag.chains as c
            importlib.reload(c)
            result = c.format_docs([])
        self.assertEqual(result, "")


class TestStripThink(unittest.TestCase):
    """strip_think should remove <think>…</think> blocks from model output."""

    def _get_strip_think(self):
        with _EMBED_PATCH, _PSYCOPG2_PATCH, _LLM_PATCH:
            import importlib
            import services.rag.chains as c
            importlib.reload(c)
            return c.strip_think

    def test_removes_single_think_block(self):
        strip_think = self._get_strip_think()
        raw = "<think>I should think about this carefully.</think>Here is my answer."
        self.assertEqual(strip_think(raw), "Here is my answer.")

    def test_removes_multiline_think_block(self):
        strip_think = self._get_strip_think()
        raw = "<think>\nLine one\nLine two\n</think>Final answer."
        self.assertEqual(strip_think(raw), "Final answer.")

    def test_no_think_tag_unchanged(self):
        strip_think = self._get_strip_think()
        raw = "Plain answer with no think tags."
        self.assertEqual(strip_think(raw), raw)

    def test_multiple_think_blocks_all_removed(self):
        strip_think = self._get_strip_think()
        raw = "<think>first</think>Middle<think>second</think>End"
        result = strip_think(raw)
        self.assertNotIn("<think>", result)
        self.assertIn("Middle", result)
        self.assertIn("End", result)

    def test_empty_string_returns_empty(self):
        strip_think = self._get_strip_think()
        self.assertEqual(strip_think(""), "")


if __name__ == "__main__":
    unittest.main()
