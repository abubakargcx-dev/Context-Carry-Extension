(function () {
  const shared = () => window.__contextCarryShared;

  function conversationRoot() {
    return (
      document.querySelector("chat-window") ||
      document.querySelector('[data-test-id="chat-history"]') ||
      document.querySelector("infinite-scroller") ||
      document.querySelector("main") ||
      document.body
    );
  }

  function userNodes(root) {
    return Array.from(
      root.querySelectorAll(
        "user-query, .user-query, [data-test-id='user-query'], .query-text"
      )
    );
  }

  function assistantNodes(root) {
    return Array.from(
      root.querySelectorAll(
        "model-response, .model-response, [data-test-id='model-response'], message-content, .model-response-text"
      )
    );
  }

  function collectMessages() {
    const { extractTextClean } = shared();
    const root = conversationRoot();
    const users = userNodes(root);
    const assistants = assistantNodes(root);

    const items = [];
    const tagged = [
      ...users.map((el) => ({ el, role: "user" })),
      ...assistants.map((el) => ({ el, role: "assistant" })),
    ].map((item) => ({
      ...item,
      top: item.el.getBoundingClientRect().top,
    }));

    tagged.sort((a, b) => a.top - b.top);
    const seen = new Set();
    for (const item of tagged) {
      if (seen.has(item.el)) continue;
      if (item.role === "assistant" && item.el.closest("user-query")) continue;
      if (item.role === "user" && item.el.closest("model-response")) continue;
      seen.add(item.el);
      items.push({ role: item.role, text: extractTextClean(item.el) });
    }
    return items;
  }

  async function scrape(mode) {
    const {
      autoScrollToLoadAll,
      sliceLastConversation,
      sanityCheck,
    } = shared();
    const root = conversationRoot();
    let warning = "";

    if (mode === "full") {
      const anchor = userNodes(root)[0] || root;
      const scroll = await autoScrollToLoadAll(anchor, () => collectMessages().length);
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
      return { ok: false, error: check.reason, site: "gemini" };
    }
    return { ok: true, messages: check.messages, site: "gemini", warning };
  }

  function dump() {
    const { summarizeNode } = shared();
    const root = conversationRoot();
    const users = userNodes(root);
    const assistants = assistantNodes(root);
    return {
      url: location.href,
      title: document.title,
      adapter: "gemini",
      userCount: users.length,
      assistantCount: assistants.length,
      users: users.slice(0, 30).map((el, i) => ({
        index: i,
        tag: el.tagName,
        testId: el.getAttribute("data-test-id") || el.getAttribute("data-testid"),
        textLen: (el.textContent || "").trim().length,
      })),
      assistants: assistants.slice(0, 30).map((el, i) => ({
        index: i,
        tag: el.tagName,
        testId: el.getAttribute("data-test-id") || el.getAttribute("data-testid"),
        textLen: (el.textContent || "").trim().length,
      })),
      sampleRoot: summarizeNode(root),
    };
  }

  window.__contextCarryAdapter = {
    name: "gemini",
    scrape,
    dump,
  };
})();
