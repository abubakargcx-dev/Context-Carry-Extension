(function () {
  const shared = () => window.__contextCarryShared;

  function turnSections() {
    const turns = Array.from(
      document.querySelectorAll('[data-testid^="conversation-turn-"]')
    );
    if (turns.length) return turns;
    return Array.from(document.querySelectorAll("[data-message-author-role]"));
  }

  function roleForTurn(section) {
    if (section.matches?.("[data-message-author-role]")) {
      return section.getAttribute("data-message-author-role") === "user"
        ? "user"
        : "assistant";
    }
    if (section.querySelector(".user-message-bubble-color")) return "user";
    const attr = section.querySelector("[data-message-author-role]");
    if (attr) {
      const role = attr.getAttribute("data-message-author-role");
      if (role === "user") return "user";
      if (role === "assistant" || role === "system") return "assistant";
    }
    if (section.querySelector('[data-testid="user-message"]')) return "user";
    return "assistant";
  }

  function collectMessages() {
    const { extractTextClean } = shared();
    return turnSections().map((section) => ({
      role: roleForTurn(section),
      text: extractTextClean(section),
    }));
  }

  async function scrape(mode) {
    const {
      autoScrollToLoadAll,
      sliceLastConversation,
      sanityCheck,
    } = shared();

    let warning = "";
    if (mode === "full") {
      const first = turnSections()[0] || document.querySelector("main") || document.body;
      const scroll = await autoScrollToLoadAll(first, () => turnSections().length);
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
      return { ok: false, error: check.reason, site: "chatgpt" };
    }
    return { ok: true, messages: check.messages, site: "chatgpt", warning };
  }

  function dump() {
    const { summarizeNode } = shared();
    const turns = turnSections().map((section, i) => ({
      index: i,
      testId: section.getAttribute("data-testid"),
      roleGuess: roleForTurn(section),
      textLen: (section.textContent || "").trim().length,
      hasUserBubble: Boolean(section.querySelector(".user-message-bubble-color")),
      authorRoleAttr: section
        .querySelector("[data-message-author-role]")
        ?.getAttribute("data-message-author-role"),
      placeholder: (section.textContent || "").trim().length === 0,
    }));
    return {
      url: location.href,
      title: document.title,
      adapter: "chatgpt",
      turnCount: turns.length,
      turns,
      sampleRoot: summarizeNode(document.querySelector("main")),
    };
  }

  window.__contextCarryAdapter = {
    name: "chatgpt",
    scrape,
    dump,
  };
})();
