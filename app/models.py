from pydantic import BaseModel, Field, HttpUrl


class SummaryRequest(BaseModel):
    urls: list[HttpUrl] = Field(min_length=1, max_length=5)
    question: str | None = Field(default=None, max_length=500)
    max_sentences: int = Field(default=5, ge=2, le=10)


class SourceResult(BaseModel):
    index: int
    title: str
    url: str
    excerpt: str


class SummaryResponse(BaseModel):
    summary: str
    provider: str
    sources: list[SourceResult]
