from pydantic import BaseModel


class Config(BaseModel):
    """Canonical defaults for the report pipeline.

    These values document the system's actual behavior so the config can serve
    as a single source of truth. `companies_per_report` matches the report
    builder, which profiles the top 22 companies (report_builder.py uses
    `companies[:22]`).

    Note: `claude_model` is only consumed by the OPTIONAL clients/claude_client.py,
    which is NOT in the request path (no LLM is required to generate a report).
    It is kept aligned with claude_client.DEFAULT_MODEL for consistency.
    """

    companies_per_report: int = 22           # was 5 — corrected to match report_builder ([:22])
    selection_score_threshold: int = 55
    claude_model: str = "claude-sonnet-4-5"  # was claude-3-5-sonnet-20240620 — aligned with claude_client


def load_config() -> Config:
    """
    Takes: Nothing
    Does: Loads the configuration settings
    Returns: Config object
    """
    return Config()
