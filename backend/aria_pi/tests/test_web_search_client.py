"""Tests for the web search client.

The Tavily SDK is an optional dependency; these tests cover the mock
fallback (no key), the live path via a stubbed client, and error handling —
without requiring `tavily` to be installed.
"""
from unittest.mock import MagicMock

from aria_pi.clients.web_search_client import WebSearchClient


def test_no_key_returns_nothing(monkeypatch):
    """
    takes: a client with no API key and no TAVILY_API_KEY env var
    does: searches company news without a real search backend
    gives: an empty list — never a fabricated placeholder result
    """
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    client = WebSearchClient(api_key=None)
    assert client.client is None
    assert client.search_company_news("Moderna") == []


def test_live_path_returns_results(monkeypatch):
    """
    Takes: A client with a stubbed Tavily client returning results.
    Does: Searches company news.
    Returns: The provider's results list.
    """
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    client = WebSearchClient(api_key=None)
    mock = MagicMock()
    mock.search.return_value = {"results": [{"title": "Deal", "url": "https://x"}]}
    client.client = mock  # inject live client directly
    results = client.search_company_news("Pfizer")
    assert results == [{"title": "Deal", "url": "https://x"}]


def test_live_path_error_returns_empty(monkeypatch):
    """
    Takes: A client whose search raises.
    Does: Searches company news.
    Returns: An empty list (graceful degradation).
    """
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    client = WebSearchClient(api_key=None)
    mock = MagicMock()
    mock.search.side_effect = RuntimeError("429")
    client.client = mock
    assert client.search_company_news("Pfizer") == []
