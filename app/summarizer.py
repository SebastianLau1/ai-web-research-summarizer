import math
import re
from collections import Counter
from dataclasses import dataclass

from .extractor import Document


SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9])")
WORD = re.compile(r"[A-Za-z][A-Za-z0-9'-]{2,}")
STOPWORDS = {
    "and", "are", "but", "for", "from", "has", "have", "into", "its", "not", "that", "the",
    "their", "this", "through", "was", "were", "will", "with", "you", "your",
}


@dataclass(frozen=True)
class Evidence:
    source_index: int
    sentence: str
    score: float


def _tokens(text: str) -> list[str]:
    return [token.lower() for token in WORD.findall(text) if token.lower() not in STOPWORDS]


def rank_evidence(documents: list[Document], question: str | None, limit: int) -> list[Evidence]:
    sentences: list[tuple[int, str]] = []
    for source_index, document in enumerate(documents, start=1):
        for sentence in SENTENCE.split(document.text.replace("\n", " ")):
            sentence = sentence.strip()
            if 45 <= len(sentence) <= 420:
                sentences.append((source_index, sentence))

    corpus_frequency = Counter(token for _, sentence in sentences for token in _tokens(sentence))
    query_tokens = set(_tokens(question or ""))
    ranked = []
    for source_index, sentence in sentences:
        tokens = _tokens(sentence)
        if not tokens:
            continue
        frequency_score = sum(math.log1p(corpus_frequency[token]) for token in set(tokens)) / math.sqrt(len(tokens))
        query_score = 3.0 * len(query_tokens.intersection(tokens))
        ranked.append(Evidence(source_index, sentence, frequency_score + query_score))

    ranked.sort(key=lambda item: item.score, reverse=True)
    selected: list[Evidence] = []
    normalized_seen: set[str] = set()
    for item in ranked:
        normalized = " ".join(_tokens(item.sentence)[:12])
        if normalized in normalized_seen:
            continue
        normalized_seen.add(normalized)
        selected.append(item)
        if len(selected) == limit:
            break
    return selected


def extractive_summary(evidence: list[Evidence]) -> str:
    return " ".join(f"{item.sentence} [{item.source_index}]" for item in evidence)
