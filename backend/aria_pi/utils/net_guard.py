"""SSRF guard for the code paths that fetch arbitrary external URLs.

Most backend requests target fixed public APIs (SEC EDGAR, PubMed,
ClinicalTrials.gov, NIH RePORTER) with user input passed only as query
parameters, so they are not SSRF sinks. The leadership-page scraper, however,
fetches a SEC-provided company website (and follows redirects). A redirect to a
private, loopback, or link-local address — e.g. the cloud metadata endpoint at
169.254.169.254 — would be SSRF. assert_public_url() rejects non-HTTP(S)
schemes and any host that resolves to a non-public IP.
"""
import ipaddress
import socket
from urllib.parse import urlparse


class UnsafeURLError(ValueError):
    """Raised when a URL is not safe to fetch (bad scheme or private host)."""


def _ip_is_public(ip: str) -> bool:
    """Return True only for globally routable, non-reserved addresses.

    Blocks private (RFC 1918), loopback, link-local (incl. cloud metadata),
    reserved, multicast, and unspecified ranges, for both IPv4 and IPv6.
    """
    addr = ipaddress.ip_address(ip)
    return not (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_multicast
        or addr.is_unspecified
    )


def assert_public_url(url: str) -> None:
    """Raise UnsafeURLError unless url is http(s) and resolves to a public IP.

    Resolves every address the host maps to and rejects the URL if ANY of them
    is non-public, so a host that resolves to both a public and a private
    address cannot be used to smuggle a request to an internal service.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise UnsafeURLError(f"scheme not allowed: {parsed.scheme!r}")
    host = parsed.hostname
    if not host:
        raise UnsafeURLError("missing host")
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise UnsafeURLError(f"DNS resolution failed for {host!r}") from exc
    for info in infos:
        ip = info[4][0]
        if not _ip_is_public(ip):
            raise UnsafeURLError(f"host {host!r} resolves to non-public IP {ip}")
