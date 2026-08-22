importScripts("lib/storage.js", "lib/providers.js", "lib/summarize.js");

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onInstalled.addListener(async (details) => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  if (details.reason === "install") {
    const url = chrome.runtime.getURL("src/ui/onboarding.html");
    await chrome.tabs.create({ url });
  }
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isSupportedUrl(url) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return (
      host === "chatgpt.com" ||
      host === "chat.openai.com" ||
      host === "claude.ai" ||
      host === "gemini.google.com"
    );
  } catch {
    return false;
  }
}

function adapterFileForUrl(url) {
  try {
    const host = new URL(url).hostname;
    if (host === "chatgpt.com" || host === "chat.openai.com") {
      return "src/adapters/chatgpt.js";
    }
    if (host === "claude.ai") return "src/adapters/claude.js";
    if (host === "gemini.google.com") return "src/adapters/gemini.js";
  } catch {
    return null;
  }
  return null;
}

async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    return null;
  }
}

async function injectPageScripts(tab) {
  const files = ["src/adapters/_contract.js"];
  const adapter = adapterFileForUrl(tab.url);
  if (adapter) files.push(adapter);
  files.push("src/content-bridge.js");
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files,
  });
}

async function requestFromPage(tab, payload) {
  if (adapterFileForUrl(tab.url)) {
    await injectPageScripts(tab);
  }
  let result = await sendToTab(tab.id, payload);
  const missingAdapter =
    result &&
    ((payload.type === "SCRAPE" && /not auto-detected/i.test(result.error || "")) ||
      (payload.type === "DUMP_STRUCTURE" && result.dump && !result.dump.adapter));
  if (!result || missingAdapter) {
    await injectPageScripts(tab);
    result = await sendToTab(tab.id, payload);
  }
  if (result) return result;
  throw new Error(
    "Could not reach this page. Refresh the tab, then try again. If the site is not ChatGPT, Claude, or Gemini, highlight the conversation and use manual selection."
  );
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((err) => {
      sendResponse({ ok: false, error: err.message || String(err) });
    });
  return true;
});

async function handleMessage(message) {
  switch (message.type) {
    case "GET_SETTINGS":
      return { ok: true, settings: await ContextCarryStorage.getSettings() };
    case "SAVE_SETTINGS":
      return {
        ok: true,
        settings: await ContextCarryStorage.saveSettings(message.patch),
      };
    case "GET_CONTEXTS":
      return { ok: true, contexts: await ContextCarryStorage.getContexts() };
    case "ADD_CONTEXT":
      return { ok: true, context: await ContextCarryStorage.addContext(message.entry) };
    case "UPDATE_CONTEXT":
      return {
        ok: true,
        context: await ContextCarryStorage.updateContext(message.id, message.patch),
      };
    case "DELETE_CONTEXT":
      await ContextCarryStorage.deleteContext(message.id);
      return { ok: true };
    case "IMPORT_CONTEXTS":
      return {
        ok: true,
        contexts: await ContextCarryStorage.importContexts(message.contexts),
      };
    case "TEST_PROVIDER": {
      const settings = await ContextCarryStorage.getSettings();
      const provider = resolveTestProvider(settings, message.target);
      const result = await ContextCarryProviders.testProvider(provider);
      return { ok: true, result };
    }
    case "GET_ACTIVE_PAGE": {
      const tab = await getActiveTab();
      return {
        ok: true,
        tab: tab
          ? {
              id: tab.id,
              url: tab.url || "",
              title: tab.title || "",
              supported: isSupportedUrl(tab.url),
            }
          : null,
      };
    }
    case "SCRAPE": {
      const tab = await getActiveTab();
      if (!tab?.id) throw new Error("No active tab.");
      if (tab.url && !/^https?:/i.test(tab.url)) {
        throw new Error("Open a web page with the conversation first.");
      }
      const result = await requestFromPage(tab, {
        type: "SCRAPE",
        mode: message.mode,
      });
      if (!result?.ok) {
        throw new Error(result?.error || "Scrape failed.");
      }
      return result;
    }
    case "GET_SELECTION": {
      const tab = await getActiveTab();
      if (!tab?.id) throw new Error("No active tab.");
      const result = await requestFromPage(tab, { type: "GET_SELECTION" });
      if (!result?.ok) throw new Error(result?.error || "Could not read selection.");
      return result;
    }
    case "DUMP_STRUCTURE": {
      const tab = await getActiveTab();
      if (!tab?.id) throw new Error("No active tab.");
      const result = await requestFromPage(tab, { type: "DUMP_STRUCTURE" });
      if (!result?.ok) throw new Error(result?.error || "Dump failed.");
      return result;
    }
    case "CAPTURE_AND_SUMMARIZE":
      return captureAndSummarize(message);
    default:
      throw new Error(`Unknown message: ${message.type}`);
  }
}

function resolveTestProvider(settings, target) {
  if (target === "groq") {
    const p = ContextCarryProviders.groqConfig(settings);
    if (!p) throw new Error("Add a Groq API key first.");
    return p;
  }
  if (target === "openrouter") {
    const p = ContextCarryProviders.openrouterConfig(settings);
    if (!p) throw new Error("Add an OpenRouter API key first.");
    return p;
  }
  const custom = (settings.customProviders || []).find((p) => p.id === target);
  if (!custom) throw new Error("Provider not found.");
  return {
    id: custom.id,
    name: custom.name || "Custom provider",
    type: custom.type === "anthropic" ? "anthropic" : "openai",
    key: custom.key,
    model: custom.model,
    url:
      custom.type === "anthropic"
        ? custom.endpoint || "https://api.anthropic.com/v1/messages"
        : ContextCarryProviders.completionsUrl(custom.endpoint),
  };
}

async function captureAndSummarize(message) {
  const settings = await ContextCarryStorage.getSettings();
  let messages = message.messages;
  let sourceSite = message.sourceSite || "unknown";
  let scrapeNote = "";

  if (!messages) {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error("No active tab.");
    if (tab.url && !/^https?:/i.test(tab.url)) {
      throw new Error("Open a web page with the conversation first.");
    }

    if (message.mode === "manual") {
      const sel = await requestFromPage(tab, { type: "GET_SELECTION" });
      if (!sel.ok || !sel.text) {
        throw new Error(
          "No text is selected. Highlight the conversation on the page, then try again."
        );
      }
      messages = [{ role: "user", text: sel.text }];
      sourceSite = hostLabel(tab.url);
      scrapeNote = "Used the selected page text (manual fallback).";
    } else {
      const scraped = await requestFromPage(tab, {
        type: "SCRAPE",
        mode: message.mode,
      });
      if (!scraped.ok) {
        throw new Error(
          scraped.error ||
            "Could not read this chat automatically. Highlight the conversation and use “Use selected text”."
        );
      }
      messages = scraped.messages;
      sourceSite = scraped.site || hostLabel(tab.url);
      scrapeNote = scraped.warning || "";
    }
  }

  const result = await ContextCarrySummarize.summarizeWithFailover(
    messages,
    settings,
    null
  );

  const title = ContextCarrySummarize.defaultTitle(messages, sourceSite);
  return {
    ok: true,
    title,
    sourceSite,
    summarized: result.summarized,
    content: result.content,
    usedProvider: result.usedProvider,
    errors: result.errors,
    scrapeNote,
    messageCount: messages.length,
  };
}

function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}
