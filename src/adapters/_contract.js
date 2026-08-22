(function () {
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function findScrollParent(el) {
    let node = el;
    while (node && node !== document.documentElement) {
      const style = window.getComputedStyle(node);
      const oy = style.overflowY;
      if (
        (oy === "auto" || oy === "scroll" || oy === "overlay") &&
        node.scrollHeight > node.clientHeight + 8
      ) {
        return node;
      }
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  async function autoScrollToLoadAll(anchorEl, getMessageCount, options) {
    const opts = options || {};
    const maxIters = opts.maxIters || 45;
    const pauseMs = opts.pauseMs || 380;
    const settleMs = opts.settleMs || 550;
    if (!anchorEl) return { scrolled: false, reason: "no-anchor" };

    const scroller = findScrollParent(anchorEl);
    let lastCount = -1;
    let lastTop = -1;
    let lastHeight = -1;
    let stable = 0;

    try {
      for (let i = 0; i < maxIters; i++) {
        scroller.scrollTop = 0;
        if (scroller === document.documentElement || scroller === document.body) {
          window.scrollTo(0, 0);
        }
        await sleep(pauseMs);
        const count = typeof getMessageCount === "function" ? getMessageCount() : 0;
        const top = scroller.scrollTop;
        const height = scroller.scrollHeight;
        if (count === lastCount && top === lastTop && height === lastHeight) {
          stable += 1;
          if (stable >= 3) break;
        } else {
          stable = 0;
        }
        lastCount = count;
        lastTop = top;
        lastHeight = height;
      }
      await sleep(settleMs);
      return { scrolled: true };
    } catch (err) {
      console.warn(
        "Context Carry: auto-scroll failed, continuing with what's rendered.",
        err
      );
      return { scrolled: false, reason: err && err.message };
    }
  }

  function normalizeText(s) {
    return String(s || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function extractText(el) {
    if (!el) return "";
    return normalizeText(el.textContent || "");
  }

  function extractTextClean(el) {
    if (!el) return "";
    const clone = el.cloneNode(true);
    clone
      .querySelectorAll(
        "button, nav, svg, style, script, [data-testid*='copy'], [aria-label*='Copy'], [aria-label*='Edit']"
      )
      .forEach((n) => n.remove());
    return extractText(clone);
  }

  function sliceLastConversation(messages) {
    if (!messages.length) return messages;
    let lastUser = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUser = i;
        break;
      }
    }
    if (lastUser === -1) return messages.slice(-2);
    return messages.slice(lastUser);
  }

  function sanityCheck(messages) {
    const all = messages || [];
    const nonempty = all.filter((m) => m && m.text && m.text.trim());
    if (!nonempty.length) {
      return {
        ok: false,
        reason:
          "No messages found on this page. If this is a supported chat site, it may have changed — try selecting the conversation text instead.",
      };
    }
    if (all.length && nonempty.length / all.length < 0.6) {
      return {
        ok: false,
        reason:
          "Too many empty message slots — the page may still be loading. Scroll the chat, wait a moment, then try again.",
      };
    }
    const hasUser = nonempty.some((m) => m.role === "user");
    const hasAssistant = nonempty.some((m) => m.role === "assistant");
    if (!hasUser || !hasAssistant) {
      return {
        ok: false,
        reason:
          "Could not find both a user message and an assistant reply. Highlight the conversation and use “Use selected text”.",
      };
    }
    return { ok: true, messages: nonempty };
  }

  function summarizeNode(el) {
    if (!el || el.nodeType !== 1) return null;
    const classes = (el.className && String(el.className).trim()) || "";
    return {
      tag: el.tagName,
      role: el.getAttribute("role"),
      testId: el.getAttribute("data-testid"),
      classes: classes.slice(0, 180),
      textLen: (el.textContent || "").trim().length,
    };
  }

  function dumpStructure(root, options) {
    const opts = options || {};
    const maxNodes = opts.maxNodes || 80;
    const selector =
      opts.selector ||
      '[data-testid], [role], section, article, user-query, model-response';
    const scope = root || document.body;
    const nodes = [];
    const seen = new Set();

    const matches = scope.querySelectorAll(selector);
    for (const el of matches) {
      if (nodes.length >= maxNodes) break;
      if (seen.has(el)) continue;
      seen.add(el);
      const summary = summarizeNode(el);
      if (summary) nodes.push(summary);
    }

    return {
      url: location.href,
      title: document.title,
      capturedAt: new Date().toISOString(),
      nodes,
    };
  }

  window.__contextCarryShared = {
    sleep,
    findScrollParent,
    autoScrollToLoadAll,
    normalizeText,
    extractText,
    extractTextClean,
    sliceLastConversation,
    sanityCheck,
    dumpStructure,
    summarizeNode,
  };
})();
