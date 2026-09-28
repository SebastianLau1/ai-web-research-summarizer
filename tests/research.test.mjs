import test from "node:test";
import assert from "node:assert/strict";
import { isGovHost, rank, samples, stem } from "../web/research.js";
import { publicIP, handleChat, handleCollect, validateURL } from "../worker.mjs";

const chatRequest = (headers = {}) => new Request("https://example.com/api/research/chat", {
  method: "POST",
  headers: { Origin: "https://example.com", ...headers },
  body: JSON.stringify({
    question: "What is supported?",
    evidence: [{ source: 1, text: "This source supports cited answers." }],
  }),
});

test("retrieval preserves source attribution and abstains on missing topics", () => {
  const passages = rank(samples, "phase trial dose safety", 3);
  assert.ok(passages.length);
  assert.equal(passages[0].source, 0);
  assert.ok(samples[passages[0].source].text.includes(passages[0].text));
  assert.deepEqual(rank(samples, "penguins antarctica", 3), []);
});

test("light stemming matches plural and inflected question wording", () => {
  assert.equal(stem("limitations"), stem("limitation"));
  assert.equal(stem("evaluated"), stem("evaluate"));
  assert.equal(stem("status"), "status");
  const passages = rank(samples, "What are the harms of screening?", 3);
  assert.ok(passages.length, "suggested question should find evidence");
  assert.match(passages[0].text, /harm/i);
});

test("every suggested question on the page finds evidence in the sample collection", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
  const questions = [...html.matchAll(/data-question="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(questions.length, 3);
  for (const question of questions) assert.ok(rank(samples, question, 3).length, question);
});

test("only .gov hosts can be scanned", async () => {
  for (const host of ["www.cancer.gov", "seer.cancer.gov", "pubmed.ncbi.nlm.nih.gov", "cdc.gov"]) assert.equal(isGovHost(host), true, host);
  for (const host of ["example.com", "gov.example.com", "evil.gov.com", "nhs.gov.uk"]) assert.equal(isGovHost(host), false, host);
  await assert.rejects(validateURL("https://example.com/article"), /\.gov/);
});

test("duplicate evidence is removed", () => {
  const passages = rank([samples[0], samples[0]], "", 20);
  assert.equal(passages.length, new Set(passages.map((p) => p.text)).size);
});

test("blocks private and reserved destinations", () => {
  for (const ip of ["127.0.0.1", "10.0.0.1", "192.168.1.2", "169.254.169.254", "172.16.0.1", "100.64.0.1", "::1", "::ffff:127.0.0.1", "fc00::1", "2001:db8::1"]) {
    assert.equal(publicIP(ip), false, ip);
  }
  assert.equal(publicIP("8.8.8.8"), true);
  assert.equal(publicIP("2606:4700:4700::1111"), true);
});

test("rejects cross-origin scraper calls", async () => {
  const response = await handleCollect(new Request("https://example.com/api/research/collect", {
    method: "POST",
    headers: { Origin: "https://other.com" },
    body: "{}",
  }));
  assert.equal(response.status, 403);
});

test("Grok endpoint falls back cleanly when no server secret is configured", async () => {
  const response = await handleChat(chatRequest(), {});
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /not connected/i);
});

test("Grok endpoint sends bounded evidence and returns the model answer", async () => {
  const original = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ model: "grok-test", output_text: "Supported by the evidence [1]." }), {
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const response = await handleChat(chatRequest({ "cf-connecting-ip": "203.0.113.9" }), { XAI_API_KEY: "test-key", XAI_MODEL: "grok-test" });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).answer, "Supported by the evidence [1].");
    assert.equal(requestBody.model, "grok-test");
    assert.match(requestBody.input, /untrusted data/);
    assert.match(requestBody.input, /\[1\]/);
  } finally {
    globalThis.fetch = original;
  }
});
