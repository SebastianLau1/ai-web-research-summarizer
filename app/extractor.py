import re
from dataclasses import dataclass

from bs4 import BeautifulSoup

from .fetcher import FetchedPage


SPACE = re.compile(r"\s+")


@dataclass(frozen=True)
class Document:
    title: str
    url: str
    text: str


def extract_document(page: FetchedPage) -> Document:
    soup = BeautifulSoup(page.html, "html.parser")
    for node in soup(["script", "style", "noscript", "nav", "footer", "form", "svg"]):
        node.decompose()

    title = SPACE.sub(" ", soup.title.get_text(" ", strip=True)).strip() if soup.title else page.url
    root = soup.find("article") or soup.find("main") or soup.body or soup
    blocks = []
    for node in root.find_all(["h1", "h2", "h3", "p", "li"]):
        value = SPACE.sub(" ", node.get_text(" ", strip=True)).strip()
        if len(value) >= 35:
            blocks.append(value)
    text = "\n".join(dict.fromkeys(blocks))[:80_000]
    if len(text) < 120:
        raise ValueError(f"Not enough readable text was found at {page.url}")
    return Document(title=title[:200], url=page.url, text=text)
