import asyncio
import os

import boto3

from .summarizer import Evidence


async def summarize_with_bedrock(evidence: list[Evidence], question: str | None) -> str | None:
    model_id = os.getenv("BEDROCK_MODEL_ID")
    if not model_id:
        return None

    evidence_text = "\n".join(f"[{item.source_index}] {item.sentence}" for item in evidence)
    prompt = (
        "Write a concise, factual research summary using only the evidence below. "
        "Keep the bracketed source markers with the claims they support. "
        "If the evidence does not answer the question, say so.\n\n"
        f"Question: {question or 'Summarize the main findings.'}\n\nEvidence:\n{evidence_text}"
    )

    def invoke() -> str:
        client = boto3.client("bedrock-runtime", region_name=os.getenv("AWS_REGION", "us-east-1"))
        response = client.converse(
            modelId=model_id,
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig={"maxTokens": 700, "temperature": 0.1, "topP": 0.9},
        )
        return response["output"]["message"]["content"][0]["text"]

    return await asyncio.to_thread(invoke)
