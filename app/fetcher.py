import asyncio
import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

import httpx


USER_AGENT = "AIWebResearchSummarizer/1.0 (+personal research project)"


@dataclass(frozen=True)
class FetchedPage:
    url: str
    html: str


async def _validate_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Only public HTTP and HTTPS URLs are supported")

    loop = asyncio.get_running_loop()
    records = await loop.getaddrinfo(parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM)
    for record in records:
        address = ipaddress.ip_address(record[4][0])
        if not address.is_global:
            raise ValueError(f"Blocked non-public address for {parsed.hostname}")


async def fetch_page(client: httpx.AsyncClient, url: str, redirects: int = 0) -> FetchedPage:
    if redirects > 3:
        raise ValueError("Too many redirects")
    await _validate_public_url(url)
    response = await client.get(url)
    if response.is_redirect:
        target = response.headers.get("location")
        if not target:
            raise ValueError("Redirect did not include a destination")
        return await fetch_page(client, urljoin(url, target), redirects + 1)
    response.raise_for_status()
    content_type = response.headers.get("content-type", "")
    if "text/html" not in content_type:
        raise ValueError(f"Unsupported content type: {content_type or 'unknown'}")
    if len(response.content) > 2_000_000:
        raise ValueError("Page exceeds the 2 MB response limit")
    return FetchedPage(url=str(response.url), html=response.text)


async def fetch_all(urls: list[str]) -> list[FetchedPage]:
    limits = httpx.Limits(max_connections=5, max_keepalive_connections=5)
    timeout = httpx.Timeout(12.0, connect=5.0)
    headers = {"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"}
    async with httpx.AsyncClient(headers=headers, timeout=timeout, limits=limits, follow_redirects=False) as client:
        results = await asyncio.gather(*(fetch_page(client, url) for url in urls), return_exceptions=True)

    pages = [result for result in results if isinstance(result, FetchedPage)]
    if not pages:
        messages = [str(result) for result in results if isinstance(result, Exception)]
        raise ValueError("No pages could be collected: " + "; ".join(messages[:3]))
    return pages
