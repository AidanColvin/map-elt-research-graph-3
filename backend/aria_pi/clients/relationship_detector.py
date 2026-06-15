"""Relationship signal detector — builds RelationshipSignal list from existing data.

Converts already-fetched SEC verbatim quotes (confirmed) and COI disclosures
(probable) into a normalized RelationshipSignal list. No new API calls.
"""
from typing import List


def fetch_relationship_signals(
    company_name: str,
    financial: dict,
    coi: dict,
    trials: List[dict],
) -> List[dict]:
    """Build RelationshipSignal list from pre-fetched partnership evidence.

    confirmed: SEC verbatim UNC mentions (filing_type = "SEC 10-K")
    probable:  COI disclosures in UNC-authored papers
    Trials with UNC signal add a "confirmed" entry from ClinicalTrials.gov.

    Parameters
    ----------
    financial : dict from resolve_sec_verbatim — { quotes, filing_url, cik }
    coi : dict from resolve_coi — { count, papers, window_years }
    trials : list of trial dicts already filtered for unc_signal

    Returns list of RelationshipSignal dicts:
      { strength, filing_type, date, excerpt, source_url, nct_id }
    """
    signals: List[dict] = []

    for q in (financial.get("quotes") or [])[:3]:
        text = q if isinstance(q, str) else (q.get("text") or "")
        url = financial.get("filing_url") or ""
        if isinstance(q, dict):
            url = q.get("filing_url") or url
        if not text:
            continue
        signals.append({
            "strength": "confirmed",
            "filing_type": "SEC 10-K",
            "date": "",
            "excerpt": text[:300],
            "source_url": url,
            "nct_id": "",
        })

    for p in (coi.get("papers") or [])[:3]:
        title = p.get("title") or ""
        year = p.get("year") or ""
        url = p.get("url") or ""
        if not title:
            continue
        signals.append({
            "strength": "probable",
            "filing_type": "PubMed COI disclosure",
            "date": str(year),
            "excerpt": title[:300],
            "source_url": url,
            "nct_id": "",
        })

    for t in (trials or [])[:2]:
        nct_id = t.get("nct_id") or ""
        title = t.get("title") or ""
        if not nct_id:
            continue
        signals.append({
            "strength": "confirmed",
            "filing_type": "ClinicalTrials.gov",
            "date": "",
            "excerpt": title[:300],
            "source_url": t.get("url") or f"https://clinicaltrials.gov/study/{nct_id}",
            "nct_id": nct_id,
        })

    return signals
