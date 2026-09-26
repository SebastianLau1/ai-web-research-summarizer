from fastapi import FastAPI, HTTPException

from .bedrock import summarize_with_bedrock
from .extractor import extract_document
from .fetcher import fetch_all
from .models import SourceResult, SummaryRequest, SummaryResponse
from .summarizer import extractive_summary, rank_evidence


app = FastAPI(
    title="AI Web Research Summarizer",
    description="Collects public web sources and produces a source-grounded summary.",
    version="1.0.0",
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/summarize", response_model=SummaryResponse)
async def summarize(request: SummaryRequest) -> SummaryResponse:
    try:
        pages = await fetch_all([str(url) for url in request.urls])
        documents = [extract_document(page) for page in pages]
        evidence = rank_evidence(documents, request.question, request.max_sentences)
        if not evidence:
            raise ValueError("No summary evidence could be extracted")
        generated = await summarize_with_bedrock(evidence, request.question)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail="A source or model request failed") from error

    sources = [
        SourceResult(
            index=index,
            title=document.title,
            url=document.url,
            excerpt=document.text[:240].replace("\n", " ") + "…",
        )
        for index, document in enumerate(documents, start=1)
    ]
    return SummaryResponse(
        summary=generated or extractive_summary(evidence),
        provider="amazon-bedrock" if generated else "extractive-fallback",
        sources=sources,
    )
