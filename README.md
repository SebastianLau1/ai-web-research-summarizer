# GovScrape AI

An AI scraper for cancer research from government sources: scrape .gov pages (National Cancer Institute, NIH, CDC, and others), get a citation-grounded brief, and question it with a retrieval chatbot. For research and education, not medical advice.

[Live app](https://sebastianlau1.github.io/ai-web-research-summarizer/) · [Portfolio](https://sebastianlau.is-a.dev)

## Run

```sh
npm run dev
# Open http://localhost:8080
npm test
```

## What it does

Each source gets a color, and every line of the brief and every chat answer carries a matching citation chip. Hover a source, finding, or citation to trace it across the page. Retrieval uses IDF-weighted term overlap with light suffix stemming, so a question about "harms" finds a passage about "harm".

Only `.gov` hosts are accepted, checked in the browser and again in the Worker (including every redirect hop). The sample collection is original demo notes on clinical trial phases, screening, and cancer statistics, written for this project; it is general information, not agency text or medical advice.

The deployed GitHub Pages demo fetches up to three .gov pages through [Jina Reader](https://jina.ai/reader/), ranks evidence, creates a cited brief, and answers questions with free evidence retrieval. URLs entered in the public demo are sent to Jina AI for extraction. Sample mode uses original notes and works offline after the page loads. Pasted sources stay local.

The original Python/FastAPI backend remains in `app/`, including optional AWS Bedrock generation. The included Cloudflare Worker supports xAI's Responses API when a server deployment has an `XAI_API_KEY` secret. The key is never sent to the browser or committed to Git. GitHub Pages cannot hold server secrets, so the Grok option is disabled there and answers use deterministic retrieval. xAI API usage is billed by xAI; the retrieval mode is the always-available free path.

Architecture: browser → same-origin `/api/research/collect` → public HTTPS pages → paragraph extraction → browser ranking → optional same-origin `/api/research/chat` → xAI. Grok receives only the question and the highest-ranked passages. Requests use DNS validation, redirect checks, per-page timeouts, size limits, and a best-effort per-isolate rate limit. DNS validation is not IP pinning; a production crawler should also use network-level egress policy. No authentication, paywall bypass, JavaScript rendering, or robots-policy engine is included; only collect pages you are allowed to access.

Run the full scraper locally with `npx wrangler dev` (requires Wrangler). `npm run dev` serves the static sample/paste demo only.

## Deployment

Every push to `main` runs the tests and publishes `web/` to GitHub Pages (`.github/workflows/deploy.yml`). For the scraper and Grok routes, deploy as a Cloudflare Worker with `wrangler.jsonc` and set the `XAI_API_KEY` secret.

No credentials are stored in source.

## Original Python service

# AI Web Research Summarizer

A small FastAPI service that asynchronously collects public web pages, extracts readable text, ranks evidence, and produces a source-grounded summary. It uses a deterministic extractive summarizer by default and can call Amazon Bedrock through the Converse API when `BEDROCK_MODEL_ID` is configured.

## What it demonstrates

- Concurrent web collection with `asyncio` and `httpx`
- URL validation and private-network blocking
- HTML cleanup, text chunking, evidence ranking, and inline source markers
- Optional Amazon Bedrock generation with an offline fallback
- Typed FastAPI request and response models
- Unit tests and a production container definition

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000/docs`, then submit up to five public URLs to `POST /api/v1/summarize`.

Example request:

```json
{
  "urls": ["https://example.com/article"],
  "question": "What are the main findings?",
  "max_sentences": 5
}
```

To enable Bedrock:

```bash
export AWS_REGION=us-east-1
export BEDROCK_MODEL_ID=amazon.nova-micro-v1:0
```

The service uses the normal AWS credential chain; no credentials are stored in the project.
