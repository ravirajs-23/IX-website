/**
 * api/chat.js
 *
 * The site's chatbot backend — a Vercel serverless function, POST /api/chat.
 * Body: { message: string, history？: Array<{role, content}> }.
 * Streams the response back as Server-Sent Events: "token" (incremental
 * text), "status" (a transient "looking through the site…" note while a
 * tool call is in flight), "visual" (a render_visual payload for the
 * widget to draw), "error", and "done".
 *
 * Manual agentic loop (not the SDK's Tool Runner helper) — a deliberate
 * choice: this repo wants direct control over streaming + status events,
 * which is simpler to reason about hand-written than through the Runner's
 * abstraction for a loop this small (two tools, a handful of iterations).
 *
 * Grounding: the system prompt carries a small, CONSTANT-size core summary
 * (company facts + an aggregate case-study overview, not one line per
 * case study — see knowledge-base.js's header for why that distinction
 * matters), cached server-side via cache_control so repeat requests are
 * cheap. For specific case studies the model calls list_case_studies
 * (structured category/keyword filtering, not semantic search); for real
 * page depth it calls get_page_content(path) — only ever from a fixed
 * allowlist, never an arbitrary filesystem read.
 */
const Anthropic = require("@anthropic-ai/sdk");
const kb = require("../scripts/lib/knowledge-base");

const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 3000; // a 20-item link_list tool call alone is ~1.4K tokens
const MAX_ITERATIONS = 4;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_TURNS = 10;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
// Best-effort, single-instance only — flagged in the plan as a known MVP
// limitation. A real production limit needs Vercel KV/Upstash (shared
// across instances); this just stops one instance being hammered.
const rateLimitState = new Map();

const LIST_CASE_STUDIES_TOOL = {
  name: "list_case_studies",
  description:
    "Look up specific case studies by category and/or a keyword — structured filtering, not a guess. Always call this before naming or describing any specific case study; never invent a title, URL, or detail that didn't come back from this tool or get_page_content. Omit both filters to get a general sample (capped at 20, with a note if more exist).",
  input_schema: {
    type: "object",
    properties: {
      category: { type: "string", description: "Exact industry/category name, e.g. \"Fintech\" or \"Healthcare\" — see the knowledge base's category list for valid values." },
      keyword: { type: "string", description: "A word or short phrase to match against title, tags, summary, or benefits — e.g. \"QA\" or \"document management\"." },
    },
  },
};

const GET_PAGE_CONTENT_TOOL = {
  name: "get_page_content",
  description:
    "Fetch the full text of one page on the site, for when the knowledge base summary isn't enough to answer confidently (exact figures, a detailed comparison, specific wording). Pass the exact path as shown in the knowledge base (e.g. \"/case-studies/some-slug.html\" or \"/about.html\"). You can call this more than once in the same turn if a question needs several pages combined.",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Exact page path from the knowledge base, starting with /" },
    },
    required: ["path"],
  },
};

const RENDER_VISUAL_TOOL = {
  name: "render_visual",
  description:
    "Call this ALONGSIDE your text answer when the content is numeric (stat_cards, bar_chart), comparative (comparison), or a list of 4+ pages/case studies the visitor asked to see (link_list — the widget shows them 3 at a time with a 'Show next 3' button, so never spell a long list out in text). Never call it for a purely qualitative answer. It doesn't return data to you — it tells the chat widget to draw a visual next to your text.",
  input_schema: {
    type: "object",
    properties: {
      type: { type: "string", enum: ["stat_cards", "comparison", "bar_chart", "link_list"] },
      title: { type: "string" },
      items: {
        type: "array",
        description:
          "For stat_cards/bar_chart: one entry per stat, {label, value}. For comparison: exactly two entries, one per thing being compared, {label: <name>, value: <short description>}. For link_list: one entry per page/case study, {label: <exact title>, value: <one-line summary>, url: <exact site path from the tool results, e.g. /case-studies/slug.html>}.",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            value: { type: "string" },
            url: { type: "string", description: "link_list only: exact site path starting with /" },
          },
          required: ["label", "value"],
        },
      },
    },
    required: ["type", "items"],
  },
};

function buildSystemPrompt() {
  const instructions = `You are the IncubXperts website assistant. Visitors ask you questions and you answer using ONLY the knowledge base below and the list_case_studies/get_page_content tools — never invent a client name, statistic, outcome, or fact that isn't actually in the data.

Rules:
- Every factual claim should link to the real page it came from, using the exact URLs given.
- If the data doesn't have something, say so plainly and point to /contact.html — never guess or approximate.
- Keep answers to a short paragraph, not an essay.
- Write in plain prose only — the chat widget doesn't render markdown. No **bold**, no bullet lists with "-" or "*", no headings. Use real sentences; link text itself (not asterisks) is how something stands out.
- When the visitor asks to see/list/show case studies or pages and 4 or more match, do NOT write them out in text. Call render_visual with type "link_list" (one item per result: label = exact title, value = one-line summary, url = the exact path from list_case_studies) and write just one short sentence in text — say how many matched and, if list_case_studies reported more than it returned, that more exist. The widget pages them 3 at a time. For 3 or fewer, plain text with links is fine.
- Whenever your answer lists three or more distinct numbers/stats (percentages, counts, dollar amounts, etc.) across different items, or directly compares two specific things, you MUST call render_visual alongside your text answer — this is not optional when the content qualifies, it's expected every time. Don't call it for a purely qualitative answer with no real numbers to show.
- Aggregate questions (e.g. "what industries have you worked in", "how many case studies do you have") are already answerable from the knowledge base below — answer directly, no tool call needed.
- Any question naming or implying a SPECIFIC case study (by category, topic, or keyword) must go through list_case_studies first — the knowledge base below only has category counts, not individual case studies, by design (it stays small and constant-size regardless of how many case studies exist; don't try to work around that by guessing).
- For anything needing more depth than list_case_studies' summary gives (comparing two specific case studies in detail, exact figures, specific wording), call get_page_content with the exact path — call either tool more than once in the same turn if you need several results/pages together.
- Stay on topic: you're here to answer questions about IncubXperts. If asked something unrelated, say so and redirect to what you can help with.`;

  return `${instructions}\n\n${kb.buildCoreSummary()}`;
}

function validateVisual(input) {
  if (!input || typeof input !== "object") return null;
  if (!["stat_cards", "comparison", "bar_chart", "link_list"].includes(input.type)) return null;
  if (!Array.isArray(input.items)) return null;
  const isLinkList = input.type === "link_list";
  // Site-relative paths only ("/x", never "//host" or a full URL) — a
  // model-supplied URL must never be able to point a visitor off-site.
  const isSitePath = (u) => typeof u === "string" && /^\/(?!\/)[^\s]*$/.test(u);
  const items = input.items
    .filter((i) => i && typeof i.label === "string" && typeof i.value === "string")
    .filter((i) => !isLinkList || isSitePath(i.url))
    .slice(0, isLinkList ? 20 : 6)
    .map((i) => {
      const out = { label: i.label.slice(0, 160), value: i.value.slice(0, 300) };
      if (isLinkList) out.url = i.url.slice(0, 300);
      return out;
    });
  if (!items.length) return null;
  const title = typeof input.title === "string" ? input.title.slice(0, 120) : null;
  return { type: input.type, title, items };
}

function sendSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function checkRateLimit(key) {
  const now = Date.now();
  const existing = (rateLimitState.get(key) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  existing.push(now);
  rateLimitState.set(key, existing);
  return existing.length <= RATE_LIMIT_MAX_REQUESTS;
}

function isAllowedOrigin(origin) {
  if (!origin) return true; // no Origin header (e.g. same-site navigation) — allow
  return /(^|\.)incubxperts\.com$/.test(new URL(origin).hostname) || /\.vercel\.app$/.test(new URL(origin).hostname) || /^localhost$/.test(new URL(origin).hostname);
}

async function runChat(client, systemPrompt, userMessage, history, res) {
  const messages = [...history, { role: "user", content: userMessage }];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral", ttl: "1h" } }],
      tools: [LIST_CASE_STUDIES_TOOL, GET_PAGE_CONTENT_TOOL, RENDER_VISUAL_TOOL],
      messages,
    });

    stream.on("text", (delta) => sendSSE(res, "token", { text: delta }));

    const finalMessage = await stream.finalMessage();
    messages.push({ role: "assistant", content: finalMessage.content });

    if (finalMessage.stop_reason !== "tool_use") {
      return;
    }

    sendSSE(res, "status", { text: "Looking through the site…" });

    const toolResults = [];
    for (const block of finalMessage.content) {
      if (block.type !== "tool_use") continue;

      if (block.name === "list_case_studies") {
        const result = kb.listCaseStudies(block.input || {});
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      } else if (block.name === "get_page_content") {
        const result = kb.getPageContent(block.input && block.input.path);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      } else if (block.name === "render_visual") {
        const visual = validateVisual(block.input);
        if (visual) sendSSE(res, "visual", visual);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "rendered" });
      } else {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Unknown tool "${block.name}".`,
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const origin = req.headers.origin || "";
  if (origin && !isAllowedOrigin(origin)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: "Too many requests — please wait a moment and try again." });
    return;
  }

  const body = req.body || {};
  const message = body.message;
  if (typeof message !== "string" || !message.trim() || message.length > MAX_MESSAGE_LENGTH) {
    res.status(400).json({ error: `Missing or invalid "message" (1-${MAX_MESSAGE_LENGTH} characters).` });
    return;
  }
  const history = Array.isArray(body.history)
    ? body.history
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .slice(-MAX_HISTORY_TURNS)
    : [];

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  const client = new Anthropic();
  const systemPrompt = buildSystemPrompt();

  try {
    await runChat(client, systemPrompt, message, history, res);
  } catch (err) {
    console.error(err);
    sendSSE(res, "error", { message: "Something went wrong — please try again." });
  } finally {
    sendSSE(res, "done", {});
    res.end();
  }
};
