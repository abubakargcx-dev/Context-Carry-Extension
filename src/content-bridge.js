(function () {
  if (window.__contextCarryBridgeReady) return;
  window.__contextCarryBridgeReady = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handle(message)
      .then(sendResponse)
      .catch((err) => {
        sendResponse({ ok: false, error: err.message || String(err) });
      });
    return true;
  });

  async function handle(message) {
    const adapter = window.__contextCarryAdapter;
    const shared = window.__contextCarryShared;

    if (message.type === "PING") {
      return { ok: true, adapter: adapter?.name || "generic" };
    }

    if (message.type === "GET_SELECTION") {
      const text = (window.getSelection && window.getSelection().toString()) || "";
      const cleaned = shared ? shared.normalizeText(text) : text.trim();
      if (!cleaned) {
        return {
          ok: false,
          error:
            "No text is selected. Highlight the conversation on the page, then click “Use selected text”.",
        };
      }
      return { ok: true, text: cleaned };
    }

    if (message.type === "DUMP_STRUCTURE") {
      if (adapter?.dump) {
        return { ok: true, dump: adapter.dump() };
      }
      return { ok: true, dump: shared.dumpStructure(document.body) };
    }

    if (message.type === "SCRAPE") {
      if (!adapter || typeof adapter.scrape !== "function") {
        return {
          ok: false,
          error:
            "This site is not auto-detected. Highlight the conversation and use “Use selected text”.",
        };
      }
      return adapter.scrape(message.mode || "last");
    }

    return { ok: false, error: "Unknown content-script message." };
  }
})();
