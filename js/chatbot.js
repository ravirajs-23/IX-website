// Chatbot widget — talks to /api/chat over a streamed (SSE-shaped) POST
// response. Keeps conversation history in memory only (tab lifetime),
// never persisted — matches the v1 scope (no server-side storage either).

// The widget's markup lives here (not in each page's HTML) so adding or
// changing it never touches the ~120 generated pages — js/script.js, which
// every page already loads, pulls this file in.
const WIDGET_HTML = `
<button type="button" class="chatbot-toggle" id="chatbot-toggle" aria-label="Open chat" aria-expanded="false" aria-controls="chatbot-panel">
  <svg class="chatbot-toggle-icon-open" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 4h16v12H7l-3 3V4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
  <svg class="chatbot-toggle-icon-close" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
</button>
<div class="chatbot-panel" id="chatbot-panel" hidden>
  <div class="chatbot-panel-header">
    <span>Ask IncubXperts</span>
    <button type="button" class="chatbot-close" id="chatbot-close" aria-label="Close chat">&times;</button>
  </div>
  <div class="chatbot-messages" id="chatbot-messages">
    <div class="chatbot-message chatbot-message--assistant">
      <p>Hi! Ask me anything about IncubXperts — our work, services, industries, or team.</p>
    </div>
  </div>
  <div class="chatbot-status" id="chatbot-status" hidden></div>
  <form class="chatbot-form" id="chatbot-form">
    <input type="text" class="chatbot-input" id="chatbot-input" placeholder="Ask a question…" autocomplete="off" maxlength="2000" aria-label="Your question" />
    <button type="submit" class="chatbot-send" aria-label="Send">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 11.5L21 3l-7.5 18-2.5-7.5L3 11.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /></svg>
    </button>
  </form>
</div>`;

function initChatbot() {
  if (document.getElementById("chatbot-widget")) return;
  const widget = document.createElement("div");
  widget.className = "chatbot-widget";
  widget.id = "chatbot-widget";
  widget.innerHTML = WIDGET_HTML;
  document.body.appendChild(widget);

  const toggle = document.getElementById("chatbot-toggle");
  const panel = document.getElementById("chatbot-panel");
  const closeBtn = document.getElementById("chatbot-close");
  const messagesEl = document.getElementById("chatbot-messages");
  const statusEl = document.getElementById("chatbot-status");
  const form = document.getElementById("chatbot-form");
  const input = document.getElementById("chatbot-input");

  // Conversation survives page navigation: site links open in the SAME tab
  // (the widget is re-created on the next page), so the open/closed state and
  // the conversation are kept in sessionStorage — per tab, gone when the tab
  // closes, never sent anywhere.
  const STORE_KEY = "ix-chatbot-v1";
  const MAX_TRANSCRIPT = 40;
  const history = []; // {role, content} sent to the API as context
  const transcript = []; // {kind:"text",role,text} | {kind:"visual",visual} — what to redraw
  let sending = false;

  function saveState() {
    try {
      sessionStorage.setItem(
        STORE_KEY,
        JSON.stringify({ open: !panel.hidden, history, transcript: transcript.slice(-MAX_TRANSCRIPT) })
      );
    } catch {
      // storage unavailable (private mode, quota) — chat still works, just doesn't persist
    }
  }

  function setOpen(open, focus = true) {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    widget.classList.toggle("chatbot-widget--open", open);
    if (open && focus) input.focus();
    saveState();
  }

  toggle.addEventListener("click", () => setOpen(panel.hidden));
  closeBtn.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) setOpen(false);
  });

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addMessage(role, text) {
    const el = document.createElement("div");
    el.className = `chatbot-message chatbot-message--${role}`;
    const p = document.createElement("p");
    el.appendChild(p);
    messagesEl.appendChild(el);
    if (text) renderTextWithLinks(p, text);
    scrollToBottom();
    return p;
  }

  /** Turns a bare URL or markdown-style [text](url) into a real link —
   * the only "formatting" this widget supports, since answers are meant
   * to stay short, plain, and link out to real pages. */
  /** Single place that decides how every link in the widget opens. */
  function decorateLink(a, href) {
    a.href = href;
    // Site pages navigate in the same tab (the conversation is restored on
    // the next page); only genuinely external links (e.g. LinkedIn) open a
    // new tab so the visitor doesn't lose the site they were on.
    let external = false;
    try {
      external = new URL(href, location.href).origin !== location.origin;
    } catch {
      external = false;
    }
    if (external) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
  }

  function renderTextWithLinks(container, text) {
    container.textContent = "";
    // 1: markdown [text](url) with a site path OR full URL
    // 2: bare https:// URL   3: bare site path ending .html (optional #anchor)
    const pattern = /\[([^\]]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)|(https?:\/\/[^\s<>"']+)|(\/[a-zA-Z0-9/_-]+\.html(?:#[\w-]+)?)/g;
    let lastIndex = 0;
    let match;
    while ((match = pattern.exec(text))) {
      if (match.index > lastIndex) container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      const a = document.createElement("a");
      if (match[1] && match[2]) {
        decorateLink(a, match[2]);
        a.textContent = match[1];
        lastIndex = pattern.lastIndex;
      } else {
        // A bare URL ends where the sentence punctuation around it begins:
        // "…/anish." or "(…/anish)," must not make the dot/paren part of the
        // href (that is what produced the 404s). Trim it back to plain text.
        const raw = match[3] || match[4];
        const url = raw.replace(/[.,;:!?)\]}'"]+$/, "");
        decorateLink(a, url);
        a.textContent = url;
        lastIndex = pattern.lastIndex - (raw.length - url.length);
        pattern.lastIndex = lastIndex;
      }
      container.appendChild(a);
    }
    if (lastIndex < text.length) container.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  function renderVisual(visual) {
    const wrap = document.createElement("div");
    wrap.className = "chatbot-message chatbot-message--assistant";

    const card = document.createElement("div");
    card.className = `chatbot-visual chatbot-visual--${visual.type}`;
    if (visual.title) {
      const title = document.createElement("div");
      title.className = "chatbot-visual-title";
      title.textContent = visual.title;
      card.appendChild(title);
    }

    if (visual.type === "link_list") {
      // Paged client-side: show LINK_LIST_PAGE_SIZE at a time so a long result
      // (e.g. every Fintech case study) never forces a long scroll.
      const PAGE = 3;
      const list = document.createElement("div");
      list.className = "chatbot-link-list";
      const more = document.createElement("button");
      more.type = "button";
      more.className = "chatbot-link-more";
      let shown = 0;

      const showNext = () => {
        for (const item of visual.items.slice(shown, shown + PAGE)) {
          const row = document.createElement("a");
          decorateLink(row, typeof item.url === "string" && /^\/(?!\/)/.test(item.url) ? item.url : "#");
          row.className = "chatbot-link-item";
          const t = document.createElement("div");
          t.className = "chatbot-link-title";
          t.textContent = item.label;
          const d = document.createElement("div");
          d.className = "chatbot-link-desc";
          d.textContent = item.value;
          row.appendChild(t);
          row.appendChild(d);
          list.appendChild(row);
        }
        shown = Math.min(shown + PAGE, visual.items.length);
        const left = visual.items.length - shown;
        if (left > 0) {
          more.textContent = `Show next ${Math.min(PAGE, left)} (${left} more)`;
        } else {
          more.remove();
        }
        scrollToBottom();
      };

      more.addEventListener("click", showNext);
      card.appendChild(list);
      card.appendChild(more);
      showNext();
    } else if (visual.type === "comparison" && visual.items.length >= 2) {
      const row = document.createElement("div");
      row.className = "chatbot-comparison-row";
      for (const item of visual.items.slice(0, 2)) {
        const col = document.createElement("div");
        col.className = "chatbot-comparison-col";
        const h = document.createElement("div");
        h.className = "chatbot-comparison-label";
        h.textContent = item.label;
        const p = document.createElement("div");
        p.className = "chatbot-comparison-value";
        p.textContent = item.value;
        col.appendChild(h);
        col.appendChild(p);
        row.appendChild(col);
      }
      card.appendChild(row);
    } else if (visual.type === "bar_chart") {
      const nums = visual.items.map((i) => parseFloat(i.value)).filter((n) => !Number.isNaN(n));
      const max = nums.length ? Math.max(...nums) : 0;
      for (const item of visual.items) {
        const n = parseFloat(item.value);
        const pct = max > 0 && !Number.isNaN(n) ? Math.max(4, Math.round((n / max) * 100)) : 0;
        const row = document.createElement("div");
        row.className = "chatbot-bar-row";
        const label = document.createElement("div");
        label.className = "chatbot-bar-label";
        label.textContent = item.label;
        const track = document.createElement("div");
        track.className = "chatbot-bar-track";
        const fill = document.createElement("div");
        fill.className = "chatbot-bar-fill";
        fill.style.width = pct + "%";
        track.appendChild(fill);
        const value = document.createElement("div");
        value.className = "chatbot-bar-value";
        value.textContent = item.value;
        row.appendChild(label);
        row.appendChild(track);
        row.appendChild(value);
        card.appendChild(row);
      }
    } else {
      // stat_cards (default)
      const grid = document.createElement("div");
      grid.className = "chatbot-stat-grid";
      for (const item of visual.items) {
        const tile = document.createElement("div");
        tile.className = "stat chatbot-stat-tile";
        const num = document.createElement("div");
        num.className = "num";
        num.textContent = item.value;
        const label = document.createElement("div");
        label.className = "label";
        label.textContent = item.label;
        tile.appendChild(num);
        tile.appendChild(label);
        grid.appendChild(tile);
      }
      card.appendChild(grid);
    }

    wrap.appendChild(card);
    messagesEl.appendChild(wrap);
    scrollToBottom();
  }

  function setStatus(text) {
    if (!text) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = text;
  }

  async function sendMessage(message) {
    sending = true;
    input.disabled = true;
    addMessage("user", message);
    history.push({ role: "user", content: message });
    transcript.push({ kind: "text", role: "user", text: message });

    const assistantP = addMessage("assistant", "");
    let assistantText = "";
    // Pushed up-front so a visual that arrives mid-answer lands after it.
    const assistantEntry = { kind: "text", role: "assistant", text: "" };
    transcript.push(assistantEntry);
    saveState();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: history.slice(0, -1) }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        assistantEntry.text = err.error || "Something went wrong — please try again.";
        renderTextWithLinks(assistantP, assistantEntry.text);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sepIndex;
        while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, sepIndex);
          buffer = buffer.slice(sepIndex + 2);

          const eventMatch = chunk.match(/^event: (.+)$/m);
          const dataMatch = chunk.match(/^data: (.+)$/m);
          if (!eventMatch || !dataMatch) continue;
          const eventName = eventMatch[1];
          let data;
          try {
            data = JSON.parse(dataMatch[1]);
          } catch {
            continue;
          }

          if (eventName === "token") {
            assistantText += data.text;
            assistantEntry.text = assistantText;
            renderTextWithLinks(assistantP, assistantText);
            scrollToBottom();
            setStatus(null);
          } else if (eventName === "status") {
            setStatus(data.text);
          } else if (eventName === "visual") {
            renderVisual(data);
            transcript.push({ kind: "visual", visual: data });
          } else if (eventName === "error") {
            assistantText = data.message;
            assistantEntry.text = assistantText;
            renderTextWithLinks(assistantP, assistantText);
          } else if (eventName === "done") {
            setStatus(null);
          }
        }
      }

      if (assistantText) history.push({ role: "assistant", content: assistantText });
    } catch (err) {
      assistantEntry.text = "Something went wrong — please try again.";
      renderTextWithLinks(assistantP, assistantEntry.text);
    } finally {
      saveState();
      setStatus(null);
      sending = false;
      input.disabled = false;
      input.focus();
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message || sending) return;
    input.value = "";
    sendMessage(message);
  });

  // Restore the conversation from the previous page in this tab, if any.
  // Everything read from storage is re-validated — it's only ever our own
  // data, but a corrupt or hand-edited entry must not break the widget.
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || "null");
    if (saved && typeof saved === "object") {
      for (const m of Array.isArray(saved.history) ? saved.history : []) {
        if (m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string") history.push(m);
      }
      for (const e of Array.isArray(saved.transcript) ? saved.transcript : []) {
        if (e && e.kind === "text" && (e.role === "user" || e.role === "assistant") && typeof e.text === "string") {
          if (e.text) addMessage(e.role, e.text);
          transcript.push(e);
        } else if (
          e && e.kind === "visual" && e.visual && Array.isArray(e.visual.items) &&
          ["stat_cards", "comparison", "bar_chart", "link_list"].includes(e.visual.type)
        ) {
          renderVisual(e.visual);
          transcript.push(e);
        }
      }
      if (saved.open) setOpen(true, false);
      scrollToBottom();
    }
  } catch {
    // unreadable saved state — start fresh
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initChatbot);
} else {
  initChatbot();
}
