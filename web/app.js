import { isGovHost, rank, samples } from "./research.js";

const $ = (id) => document.getElementById(id);
const PALETTE = ["#1f5c45", "#2f58a8", "#b0482a", "#7b4ea3", "#9a7412", "#1d7a8a", "#a33b6b", "#4b5d23"];
const STATIC_HOST = location.hostname.endsWith(".github.io"); // GitHub Pages has no API routes or secrets
const MAX_SOURCES = 8;
const today = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });

let sources = [];
let evidence = [];

const colorOf = (index) => PALETTE[index % PALETTE.length];

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

/** A numbered chip that links to, and is colored like, its source card. */
function citation(sourceIndex) {
  const link = el("a", String(sourceIndex + 1), "cite");
  link.href = `#source-${sourceIndex + 1}`;
  link.title = sources[sourceIndex]?.title ?? `Source ${sourceIndex + 1}`;
  link.dataset.source = sourceIndex;
  link.style.setProperty("--c", colorOf(sourceIndex));
  return link;
}

/* ---------- Library and brief ---------- */

function render() {
  evidence = rank(sources);

  $("sources").replaceChildren(...sources.map((source, index) => {
    const card = el("li", undefined, "source");
    card.id = `source-${index + 1}`;
    card.dataset.source = index;
    card.style.setProperty("--c", colorOf(index));
    const body = el("div");
    body.append(
      el("strong", source.title),
      el("p", source.sample ? "Sample notes · demo data" : source.url ? new URL(source.url).hostname : "Pasted text · stays local"),
    );
    if (source.url) {
      const link = el("a", "Open original ↗");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      body.append(link);
    }
    card.append(el("span", String(index + 1), "source-num"), body);
    return card;
  }));

  $("source-count").textContent = `${sources.length} ${sources.length === 1 ? "source" : "sources"}`;
  $("sources-stat").textContent = String(sources.length);
  $("evidence-stat").textContent = String(evidence.length);
  $("dateline").textContent = `Compiled ${today.format(new Date())}`;

  if (!evidence.length) {
    $("brief").replaceChildren(el("li", sources.length
      ? "No usable passages yet. Add a longer source."
      : "Load the sample collection or add a source to begin.", "empty"));
  } else {
    $("brief").replaceChildren(...evidence.map((passage, i) => {
      const item = el("li", undefined, "finding");
      item.dataset.source = passage.source;
      item.style.setProperty("--i", i);
      const quote = el("blockquote");
      quote.append(passage.text, " ", citation(passage.source));
      const body = el("div");
      body.append(quote, el("footer", sources[passage.source].title));
      item.append(el("span", String(i + 1), "finding-num"), body);
      return item;
    }));
  }
  $("export").disabled = !evidence.length;
}

/** Hovering a source, finding, or citation traces the same source everywhere on the page. */
function trace(index) {
  document.querySelectorAll(".source").forEach((card) => {
    card.classList.toggle("is-lit", Number(card.dataset.source) === index);
  });
  document.querySelectorAll(".finding").forEach((finding) => {
    const match = Number(finding.dataset.source) === index;
    finding.classList.toggle("is-lit", index !== null && match);
    finding.classList.toggle("is-dim", index !== null && !match);
  });
}

function traceFrom(event) {
  const target = event.target.closest?.("[data-source]");
  trace(target ? Number(target.dataset.source) : null);
}

document.addEventListener("pointerover", traceFrom);
document.addEventListener("focusin", traceFrom);

/* ---------- Conversation ---------- */

function scrollThread() {
  $("chat").scrollTop = $("chat").scrollHeight;
}

function message(className, ...children) {
  const node = el("div", undefined, `msg ${className}`);
  node.append(...children);
  $("chat").append(node);
  scrollThread();
  return node;
}

function resetThread(text) {
  $("chat").replaceChildren();
  message("assistant", el("p", text));
}

/** Split model output into paragraphs and turn valid [n] markers into citation chips. */
function citedParagraphs(text) {
  return text.split(/\n{2,}/).filter((part) => part.trim()).map((part) => {
    const paragraph = el("p");
    for (const piece of part.split(/(\[\d+\])/)) {
      const match = piece.match(/^\[(\d+)\]$/);
      const index = match ? Number(match[1]) - 1 : -1;
      paragraph.append(match && sources[index] ? citation(index) : piece);
    }
    return paragraph;
  });
}

function retrievalAnswer(question) {
  const results = rank(sources, question, 4);
  if (!results.length) {
    return [el("p", "I couldn’t find a passage that matches. Try different wording or add another source.")];
  }
  return [
    el("p", results.length === 1 ? "One passage speaks to this:" : `${results.length} passages speak to this:`),
    ...results.map((passage) => {
      const quote = el("blockquote");
      quote.append(passage.text, " ", citation(passage.source));
      return quote;
    }),
  ];
}

async function askGrok(question, passages) {
  if (STATIC_HOST) throw Error("Grok needs a server deployment with an xAI key.");
  const response = await fetch("/api/research/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      evidence: passages.map((passage) => ({ source: passage.source + 1, text: passage.text })),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Grok is unavailable.");
  return data;
}

async function ask(question) {
  if (!sources.length) {
    status("Add a source before asking a question.", true);
    return;
  }
  message("user", question);
  const reply = message("assistant pending", "Reading the evidence…");
  $("question").value = "";
  $("ask-button").disabled = true;

  try {
    const passages = rank(sources, question, 8);
    if ($("provider").value === "grok" && passages.length) {
      try {
        const data = await askGrok(question, passages);
        reply.replaceChildren(...citedParagraphs(data.answer));
        $("provider-note").textContent = `Answered by ${data.model || "Grok"}`;
      } catch (error) {
        reply.replaceChildren(
          ...retrievalAnswer(question),
          el("small", `Grok was unavailable, so this used free retrieval. ${error.message}`),
        );
        $("provider-note").textContent = "Retrieval fallback";
      }
      return;
    }
    reply.replaceChildren(...retrievalAnswer(question));
    $("provider-note").textContent = "Free retrieval";
  } finally {
    reply.classList.remove("pending");
    $("ask-button").disabled = false;
    scrollThread();
  }
}

/* ---------- Collection ---------- */

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
    if (!isGovHost(url.hostname)) throw Error(`${url.hostname} isn’t a .gov site.`);
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
  if (!STATIC_HOST) {
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
      return { ...data, service: "the scanner’s Worker" };
    } catch (error) {
      if (error.name === "TimeoutError") throw error;
    }
  }
  return collectWithReader(urls);
}

$("source-form").onsubmit = async (event) => {
  event.preventDefault();
  const urls = $("urls").value.split(/\n/).map((value) => value.trim()).filter(Boolean);
  if (!urls.length || urls.length > 3) {
    status("Enter between 1 and 3 .gov URLs.", true);
    return;
  }
  const outside = urls.filter((raw) => {
    try {
      return !isGovHost(new URL(raw).hostname);
    } catch {
      return true;
    }
  });
  if (outside.length) {
    status(`Only .gov pages can be scanned. Check: ${outside.join(", ")}`, true);
    return;
  }
  $("collect").disabled = true;
  status("Scanning pages and extracting readable passages…");
  try {
    const data = await collectSources(urls);
    if (data.sources.length) {
      sources = data.sources;
      render();
      resetThread("Collection updated. Ask a question about these sources.");
    }
    status(
      `${data.sources.length} ${data.sources.length === 1 ? "source" : "sources"} collected with ${data.service}.${data.errors.length ? ` ${data.errors.join(" ")}` : ""}`,
      Boolean(data.errors.length),
    );
  } catch (error) {
    status(error.name === "TimeoutError"
      ? "The request timed out. Try fewer sources."
      : `Could not collect sources: ${error.message}`, true);
  } finally {
    $("collect").disabled = false;
  }
};

$("sample").onclick = () => {
  sources = samples.map((source) => ({ ...source }));
  render();
  resetThread("Sample collection loaded. These are original demo notes on cancer research topics, not agency text or medical advice. Try a suggestion below.");
  status("Sample collection loaded. No web requests made.");
};

$("paste-form").onsubmit = (event) => {
  event.preventDefault();
  if (sources.length >= MAX_SOURCES) {
    status(`A collection holds up to ${MAX_SOURCES} sources. Load a new one to start over.`, true);
    return;
  }
  sources.push({ title: $("source-title").value, text: $("source-text").value, url: "" });
  render();
  event.target.reset();
  status("Source added. It stays in this tab.");
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
  const text = [
    "# Research brief",
    "",
    `Compiled ${today.format(new Date())}. Extractive: every line is quoted from the source it cites.`,
    "",
    ...evidence.map((passage, i) => `${i + 1}. ${passage.text} [${passage.source + 1}]`),
    "",
    "## Sources",
    "",
    ...sources.map((source, index) => `[${index + 1}] ${source.title}${source.url ? `: ${source.url}` : " (sample or pasted text)"}`),
    "",
  ].join("\n");
  const link = el("a");
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  link.href = url;
  link.download = "research-brief.md";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
};

if (STATIC_HOST) {
  const grok = $("provider").querySelector('[value="grok"]');
  grok.disabled = true;
  grok.textContent = "Grok (needs a server deploy)";
}

$("sample").click();
