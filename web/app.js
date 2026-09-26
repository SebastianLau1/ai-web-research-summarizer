import { rank, samples } from "./research.js";

const $ = (id) => document.getElementById(id);
let sources = [];
let evidence = [];

function el(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function status(text, error = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
}

function render() {
  evidence = rank(sources);
  $("sources").replaceChildren();
  sources.forEach((source, index) => {
    const card = el("article", undefined, "source");
    card.id = `source-${index + 1}`;
    card.append(
      el("strong", `[${index + 1}] ${source.title}`),
      el(
        "p",
        source.sample
          ? "Original sample notes · demo data"
          : source.url
            ? new URL(source.url).hostname
            : "Pasted text · local",
      ),
    );
    if (source.url) {
      const link = el("a", "Open source ↗", "cite");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      card.append(link);
    }
    $("sources").append(card);
  });

  $("source-count").textContent = `${sources.length} SOURCES`;
  $("sources-stat").textContent = String(sources.length).padStart(2, "0");
  $("evidence-stat").textContent = String(evidence.length).padStart(2, "0");
  $("brief").replaceChildren();
  if (!evidence.length) {
    $("brief").append(el("p", "No usable passages yet. Add a longer source text.", "subtle"));
  }
  evidence.forEach((passage, index) => {
    const finding = el("article", undefined, "finding");
    const body = el("div");
    body.append(el("p", passage.text));
    const link = el("a", `[${passage.source + 1}] ${sources[passage.source].title}`, "cite");
    link.href = `#source-${passage.source + 1}`;
    body.append(link);
    finding.append(el("span", String(index + 1).padStart(2, "0"), "number"), body);
    $("brief").append(finding);
  });
  $("export").disabled = !evidence.length;
}

function retrievalAnswer(question) {
  const results = rank(sources, question, 5);
  if (!results.length) {
    return "I couldn’t find a matching passage in this collection. Try more specific wording or add another source.";
  }
  return "Relevant source passages:\n\n" +
    results.map((passage) => `${passage.text} [${passage.source + 1}]`).join("\n\n");
}

async function collectWithReader(urls) {
  const settled = await Promise.allSettled(urls.map(async (raw) => {
    let url;
    try {
      url = new URL(raw);
    } catch {
      throw Error("Invalid URL.");
    }
    if (url.protocol !== "https:" || url.username || url.password) {
      throw Error("Only public HTTPS pages are supported.");
    }
    const response = await fetch(`https://r.jina.ai/${url.href}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(35_000),
    });
    const payload = await response.json();
    if (!response.ok || !payload?.data?.content) {
      throw Error(payload?.message || `Reader returned HTTP ${response.status}.`);
    }
    return {
      title: payload.data.title || url.hostname,
      url: payload.data.url || url.href,
      text: payload.data.content.slice(0, 30_000),
      collectedAt: new Date().toISOString(),
      reader: "Jina Reader",
    };
  }));
  const collected = [];
  const errors = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") collected.push(result.value);
    else errors.push(`Source ${index + 1}: ${result.reason.message}`);
  });
  if (!collected.length) throw Error(errors.join(" "));
  return { sources: collected, errors, service: "Jina Reader" };
}

async function collectSources(urls) {
  if (!location.hostname.endsWith(".github.io")) {
    try {
      const response = await fetch("/api/research/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
        signal: AbortSignal.timeout(40_000),
      });
      const type = response.headers.get("content-type") || "";
      if (!type.includes("application/json")) throw Error("No local collection API.");
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Collection failed.");
      return { ...data, service: "Research Desk Worker" };
    } catch (error) {
      if (error.name === "TimeoutError") throw error;
    }
  }
  return collectWithReader(urls);
}

async function ask(question) {
  if (!sources.length) {
    status("Add a source before asking a question.", true);
    return;
  }
  $("chat").append(el("div", question, "message user"));
  const pending = el("div", "Reviewing the evidence…", "message assistant");
  $("chat").append(pending);
  $("chat").scrollTop = $("chat").scrollHeight;
  $("question").value = "";
  $("ask-button").disabled = true;

  const passages = rank(sources, question, 8);
  const provider = $("provider").value;
  if (provider === "grok" && passages.length) {
    try {
      if (location.hostname.endsWith(".github.io")) {
        throw Error("Grok requires a server deployment with an xAI API key.");
      }
      const response = await fetch("/api/research/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          evidence: passages.map((passage) => ({
            source: passage.source + 1,
            text: passage.text,
          })),
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Grok is unavailable.");
      pending.textContent = data.answer;
      $("provider-note").textContent = `ANSWERED BY ${data.model || "GROK"}`;
      return;
    } catch (error) {
      pending.textContent = retrievalAnswer(question) +
        `\n\nGrok was unavailable, so Research Desk used free evidence retrieval. ${error.message}`;
      $("provider-note").textContent = "FREE RETRIEVAL FALLBACK";
      return;
    } finally {
      $("ask-button").disabled = false;
      $("chat").scrollTop = $("chat").scrollHeight;
    }
  }

  pending.textContent = retrievalAnswer(question);
  $("provider-note").textContent = "FREE EVIDENCE RETRIEVAL";
  $("ask-button").disabled = false;
  $("chat").scrollTop = $("chat").scrollHeight;
}

$("source-form").onsubmit = async (event) => {
  event.preventDefault();
  const urls = $("urls").value.split(/\n/).map((value) => value.trim()).filter(Boolean);
  if (!urls.length || urls.length > 3) {
    status("Enter between 1 and 3 public HTTPS URLs.", true);
    return;
  }
  $("collect").disabled = true;
  status("Fetching pages and extracting readable passages…");
  try {
    const data = await collectSources(urls);
    if (data.sources.length) {
      sources = data.sources;
      $("chat").replaceChildren(
        el("div", "Collection updated. Ask a question about these sources.", "message assistant"),
      );
      render();
    }
    status(
      `${data.sources.length} sources collected with ${data.service}.${data.errors.length ? ` ${data.errors.join(" ")}` : ""}`,
      Boolean(data.errors.length),
    );
  } catch (error) {
    const message = error.name === "TimeoutError"
      ? "The request timed out. Try fewer sources."
      : `Could not collect sources: ${error.message}`;
    status(message, true);
  } finally {
    $("collect").disabled = false;
  }
};

$("sample").onclick = () => {
  sources = samples.map((source) => ({ ...source }));
  render();
  $("chat").replaceChildren(
    el(
      "div",
      "Sample research loaded. These are original demonstration notes, not live web results. Ask about evaluation, limitations, or source grounding.",
      "message assistant",
    ),
  );
  status("Sample collection loaded. No web requests made.");
};

$("paste-form").onsubmit = (event) => {
  event.preventDefault();
  if (sources.length >= 8) {
    status("Start a new collection before adding more than 8 sources.", true);
    return;
  }
  sources.push({
    title: $("source-title").value,
    text: $("source-text").value,
    url: "",
  });
  render();
  event.target.reset();
  status("Source added locally.");
};

$("chat-form").onsubmit = (event) => {
  event.preventDefault();
  const question = $("question").value.trim();
  if (question) ask(question);
};

document.querySelectorAll("[data-question]").forEach((button) => {
  button.onclick = () => ask(button.dataset.question);
});

$("export").onclick = () => {
  const text = "# Research brief\n\n" +
    "Mode: extractive evidence ranking with optional Grok answers.\n\n" +
    evidence.map((passage) => `- ${passage.text} [${passage.source + 1}]`).join("\n\n") +
    "\n\n## Sources\n\n" +
    sources.map((source, index) =>
      `[${index + 1}] ${source.title}${source.url ? ` — ${source.url}` : " (sample or pasted text)"}`
    ).join("\n");
  const link = el("a");
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  link.href = url;
  link.download = "research-brief.md";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
};

$("sample").click();
