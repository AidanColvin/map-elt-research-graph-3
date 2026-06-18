"""Shared SEC company_tickers.json loader.

One download per process per 12 hours, shared by every importer. Both
sec_edgar_client and name_resolver previously fetched this ~8MB file into
their own caches, producing two cold-start downloads competing for the same
SEC rate-limit slot. This module is the single source of truth.
"""
import logging
import time
import requests

logger = logging.getLogger(__name__)

_HEADERS = {"User-Agent": "InnovateCarolina research.intelligence@unc.edu"}
_URL = "https://www.sec.gov/files/company_tickers.json"
_TTL = 43_200  # 12 hours in seconds

_CACHE: tuple[list, float] | None = None


def load_tickers() -> list:
    """Return the SEC company tickers list, cached for _TTL seconds.

    Returns [] on fetch failure — never raises.
    """
    global _CACHE
    if _CACHE is not None:
        data, fetched_at = _CACHE
        if time.time() - fetched_at < _TTL:
            return data
    try:
        r = requests.get(_URL, headers=_HEADERS, timeout=10)
        r.raise_for_status()
        raw = r.json()
        data = list(raw.values()) if isinstance(raw, dict) else []
        _CACHE = (data, time.time())
        return data
    except Exception as e:
        logger.error("tickers: failed to load company_tickers.json: %s", e)
        return _CACHE[0] if _CACHE else []
