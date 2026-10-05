// Chatbot widget — talks to /api/chat over a streamed (SSE-shaped) POST
// response. Keeps conversation history in memory only (tab lifetime),
// never persisted — matches the v1 scope (no server-side storage either).
document.addEventListener("DOMContentLoaded", () => {
  const widget = document.getElementById("chatbot-widget");
  if (!widget) return;

  const toggle = document.getElementById("chatbot-toggle");
  const panel = document.getElementById("chatbot-panel");
  const closeBtn = document.getElementById("chatbot-close");
  const messagesEl = document.getElementById("chatbot-messages");
  const statusEl = document.getElementById("chatbot-status");
  const form = document.getElementById("chatbot-form");
  const input = document.getElementById("chatbot-input");

  const history = [];
  let sending = false;

  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    widget.classList.toggle("chatbot-widget--open", open);
    if (open) input.focus();
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
  function renderTextWithLinks(container, text) {
    container.textContent = "";
    const pattern = /\[([^\]]+)\]\((\/[^\s)]+)\)|(https?:\/\/\S+)|(\/[a-zA-Z0-9/_-]+\.html)/g;
    let lastIndex = 0;
    let match;
    while ((match = pattern.exec(text))) {
      if (match.index > lastIndex) container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      const a = document.createElement("a");
      if (match[1] && match[2]) {
        a.href = match[2];
        a.textContent = match[1];
      } else {
        const url = match[3] || match[4];
        a.href = url;
        a.textContent = url;
      }
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      container.appendChild(a);
      lastIndex = pattern.lastIndex;
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

    if (visual.type === "comparison" && visual.items.length >= 2) {
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

    const assistantP = addMessage("assistant", "");
    let assistantText = "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: history.slice(0, -1) }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        renderTextWithLinks(assistantP, err.error || "Something went wrong — please try again.");
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
            renderTextWithLinks(assistantP, assistantText);
            scrollToBottom();
            setStatus(null);
          } else if (eventName === "status") {
            setStatus(data.text);
          } else if (eventName === "visual") {
            renderVisual(data);
          } else if (eventName === "error") {
            assistantText = data.message;
            renderTextWithLinks(assistantP, assistantText);
          } else if (eventName === "done") {
            setStatus(null);
          }
        }
      }

      if (assistantText) history.push({ role: "assistant", content: assistantText });
    } catch (err) {
      renderTextWithLinks(assistantP, "Something went wrong — please try again.");
    } finally {
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
});
