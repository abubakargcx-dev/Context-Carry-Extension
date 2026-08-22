(function () {
  const shared = () => window.__contextCarryShared;

  function conversationRoot() {
    return (
      document.querySelector('[data-testid="transcript-list"]') ||
      document.querySelector('[data-testid="chat-column"]') ||
      document.querySelector('[role="feed"]') ||
      document.querySelector('[data-testid="chat-stale-nav-body"]') ||
      document.querySelector('[data-testid="conversation"]') ||
      document.querySelector("main") ||
      document.body
    );
  }

  function transcriptRows(root) {
    return Array.from(
      (root || document).querySelectorAll('[data-testid="transcript-row"]')
    );
  }

  function messageEl(row) {
    return row.querySelector('[role="article"]') || row;
  }

  function roleForRow(row) {
    if (row.querySelector('[data-testid="user-message"]')) return "user";
    if (row.querySelector('[data-testid="ask-user-answers-card"]')) return "user";
    if (
      row.querySelector('[data-testid="file-thumbnail"]') &&
      !row.querySelector('[data-testid="tool-status-pill"]') &&
      !row.querySelector('[data-testid="assistant-message"]') &&
      !row.querySelector(".font-claude-message, .font-claude-response")
    ) {
      return "user";
    }
    if (row.querySelector('[data-testid="assistant-message"], .font-claude-message, .font-claude-response')) {
      return "assistant";
    }
    return "assistant";
  }

  function collectFromRows(root) {
    const { extractTextClean } = shared();
    const items = [];
    for (const row of transcriptRows(root)) {
      const el = messageEl(row);
      const text = extractTextClean(el);
      if (!text) continue;
      items.push({ role: roleForRow(row), text });
    }
    return items;
  }

  function collectLegacy(root) {
    const { extractTextClean } = shared();
    const users = Array.from(
      root.querySelectorAll('[data-testid="user-message"], [data-testid="chat-user-message"]')
    );
    const assistants = Array.from(
      root.querySelectorAll(
        '[data-testid="assistant-message"], [data-testid="assistant-turn"], .font-claude-message, .font-claude-response'
      )
    );
    const tagged = [
      ...users.map((el) => ({ el, role: "user" })),
      ...assistants.map((el) => ({ el, role: "assistant" })),
    ]
      .map((item) => ({ ...item, top: item.el.getBoundingClientRect().top }))
      .sort((a, b) => a.top - b.top);

    const seen = new Set();
    const items = [];
    for (const item of tagged) {
      if (seen.has(item.el)) continue;
      if (item.role === "assistant" && item.el.closest('[data-testid="user-message"]')) {
        continue;
      }
      seen.add(item.el);
      const text = extractTextClean(item.el);
      if (text) items.push({ role: item.role, text });
    }
    return items;
  }

  function collectMessages() {
    const root = conversationRoot();
    const fromRows = collectFromRows(root);
    if (fromRows.length) return fromRows;
    return collectLegacy(root);
  }

  async function scrape(mode) {
    const { autoScrollToLoadAll, sliceLastConversation, sanityCheck } = shared();
    const root = conversationRoot();
    let warning = "";

    if (mode === "full") {
      const anchor =
        transcriptRows(root)[0] ||
        root.querySelector('[data-testid="user-message"]') ||
        root;
      const scroll = await autoScrollToLoadAll(anchor, () => collectMessages().length, {
        maxIters: 50,
        pauseMs: 400,
        settleMs: 600,
      });
      if (!scroll.scrolled && scroll.reason) {
        warning = "Full-chat scroll did not finish; summarizing what is currently rendered.";
      }
    }

    let messages = collectMessages();
    if (mode === "last") {
      messages = sliceLastConversation(messages);
    }

    const check = sanityCheck(messages);
    if (!check.ok) {
      return { ok: false, error: check.reason, site: "claude" };
    }
    return { ok: true, messages: check.messages, site: "claude", warning };
  }

  function dump() {
    const { summarizeNode } = shared();
    const root = conversationRoot();
    const rows = transcriptRows(root).map((row, i) => {
      const childIds = Array.from(row.querySelectorAll("[data-testid]"))
        .map((el) => el.getAttribute("data-testid"))
        .filter((id, idx, arr) => arr.indexOf(id) === idx)
        .slice(0, 12);
      return {
        index: i,
        roleGuess: roleForRow(row),
        textLen: (row.textContent || "").trim().length,
        childTestIds: childIds,
      };
    });
    return {
      url: location.href,
      title: document.title,
      adapter: "claude",
      rootTestId: root.getAttribute && root.getAttribute("data-testid"),
      rowCount: rows.length,
      rows,
      sampleRoot: summarizeNode(root),
    };
  }

  window.__contextCarryAdapter = {
    name: "claude",
    scrape,
    dump,
  };
})();
