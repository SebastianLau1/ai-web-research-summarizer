# Research Desk

Web research with citation-grounded summaries and a retrieval chatbot.

[Live app](https://sebastianlau.is-a.dev/projects/research-desk/index.html) · [Portfolio](https://sebastianlau.is-a.dev)

## Run

```sh
npm run dev
# Open http://localhost:8080
npm test
```

## What it does

The deployed GitHub Pages demo fetches up to three public HTTPS pages through [Jina Reader](https://jina.ai/reader/), ranks evidence, creates a cited brief, and answers questions with free evidence retrieval. URLs entered in the public demo are sent to Jina AI for extraction. Sample mode uses original notes and works offline after the page loads. Pasted sources stay local.

The original Python/FastAPI backend remains in `app/`, including optional AWS Bedrock generation. The included Cloudflare Worker supports xAI's Responses API when a server deployment has an `XAI_API_KEY` secret. The key is never sent to the browser or committed to Git. GitHub Pages cannot hold server secrets, so its Grok option falls back to deterministic retrieval. xAI API usage is billed by xAI; the retrieval mode is the always-available free path.

Architecture: browser → same-origin `/api/research/collect` → public HTTPS pages → paragraph extraction → browser ranking → optional same-origin `/api/research/chat` → xAI. Grok receives only the question and the highest-ranked passages. Requests use DNS validation, redirect checks, per-page timeouts, size limits, and a best-effort per-isolate rate limit. DNS validation is not IP pinning; a production crawler should also use network-level egress policy. No authentication, paywall bypass, JavaScript rendering, or robots-policy engine is included; only collect pages you are allowed to access.

Run the full scraper locally with `npx wrangler dev` (requires Wrangler). `npm run dev` serves the static sample/paste demo only. The hosted portfolio carries the same Worker handler as an API route.

## Deployment

The app is independently deployable as a Cloudflare Worker/Pages static asset app using `wrangler.jsonc`. Its public demo is also deployed with the portfolio under `/projects/research-desk/`. Static app files are committed into the portfolio; to refresh them, run `python3 scripts/sync_projects.py` from the portfolio checkout with sibling project checkouts present.

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
