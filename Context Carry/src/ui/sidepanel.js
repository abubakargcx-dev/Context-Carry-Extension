const $ = (id) => document.getElementById(id);

let currentResult = null;
let editingId = null;
let contexts = [];

async function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

function setStatus(text, kind) {
  const el = $("status");
  el.textContent = text || "";
  el.className = "status" + (kind ? " " + kind : "");
}

function busy(on) {
  ["btnFull", "btnLast", "btnManual"].forEach((id) => {
    $(id).disabled = on;
  });
}

async function refreshPage() {
  const res = await send("GET_ACTIVE_PAGE");
  const tab = res.tab;
  const dot = $("pageDot");
  if (!tab) {
    $("pageLabel").textContent = "No active tab";
    dot.className = "dot off";
    $("pageHint").textContent = "";
    return;
  }
  let host = "";
  try {
    host = new URL(tab.url).hostname;
  } catch {
    host = tab.title || "Unknown page";
  }
  $("pageLabel").textContent = host || "This tab";
  if (tab.supported) {
    dot.className = "dot on";
    $("pageHint").textContent =
      "Auto-capture is available. Last exchange is faster; full chat loads older turns first.";
  } else {
    dot.className = "dot off";
    $("pageHint").textContent =
      "This site is not auto-detected. Highlight the conversation, then use selected text.";
  }
}

async function refreshKeysBanner() {
  const res = await send("GET_SETTINGS");
  const s = res.settings || {};
  const hasKey =
    Boolean(s.groqKey) ||
    Boolean(s.openrouterKey) ||
    (s.customProviders || []).some((p) => p.key);
  $("keysBanner").hidden = hasKey;
}

async function refreshLibrary() {
  const res = await send("GET_CONTEXTS");
  contexts = res.contexts || [];
  const lib = $("library");
  lib.innerHTML = "";
  $("libraryEmpty").hidden = contexts.length > 0;
  for (const item of contexts) {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `<div>
        <div class="title"></div>
        <div class="meta"></div>
      </div>`;
    el.querySelector(".title").textContent = item.title;
    const when = new Date(item.updatedAt || item.createdAt).toLocaleString();
    const kind = item.summarized ? "summarized" : "raw transcript";
    el.querySelector(".meta").textContent = `${item.sourceSite} · ${kind} · ${when}`;
    el.addEventListener("click", () => openEdit(item.id));
    lib.appendChild(el);
  }
}

function showResult(payload) {
  currentResult = payload;
  $("resultCard").hidden = false;
  $("resultTitle").value = payload.title || "";
  $("resultBody").value = payload.content || "";
  const bits = [];
  if (payload.summarized) bits.push(`Summarized via ${payload.usedProvider || "LLM"}`);
  else bits.push("Saved as raw transcript (summarization unavailable)");
  if (payload.messageCount) bits.push(`${payload.messageCount} messages`);
  if (payload.scrapeNote) bits.push(payload.scrapeNote);
  if (payload.errors?.length) bits.push(payload.errors.join(" → "));
  $("resultMeta").textContent = bits.join(" · ");
  $("resultHeading").textContent = payload.summarized ? "Handoff" : "Raw transcript";
}

async function capture(mode) {
  busy(true);
  setStatus(
    mode === "full"
      ? "Reading the full chat. This can take several seconds on long threads…"
      : mode === "manual"
        ? "Reading the selected text…"
        : "Reading the latest exchange…"
  );
  try {
    const res = await send("CAPTURE_AND_SUMMARIZE", { mode });
    if (!res?.ok) throw new Error(res?.error || "Capture failed.");
    showResult(res);
    setStatus(res.summarized ? "Handoff ready." : "Transcript ready (unsummarized).", "ok");
  } catch (err) {
    setStatus(err.message || String(err), "err");
  } finally {
    busy(false);
  }
}

function downloadMarkdown(filename, text) {
  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slug(title) {
  return (title || "context")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "context";
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

function openEdit(id) {
  const item = contexts.find((c) => c.id === id);
  if (!item) return;
  editingId = id;
  $("editCard").hidden = false;
  $("editTitle").value = item.title;
  $("editBody").value = item.content;
  $("editCard").scrollIntoView({ behavior: "smooth" });
}

$("btnFull").addEventListener("click", () => capture("full"));
$("btnLast").addEventListener("click", () => capture("last"));
$("btnManual").addEventListener("click", () => capture("manual"));

$("btnCopy").addEventListener("click", async () => {
  await copyText($("resultBody").value);
  setStatus("Copied to clipboard.", "ok");
});

$("btnDownload").addEventListener("click", () => {
  downloadMarkdown(slug($("resultTitle").value) + ".md", $("resultBody").value);
});

$("btnSave").addEventListener("click", async () => {
  if (!currentResult) return;
  const res = await send("ADD_CONTEXT", {
    entry: {
      title: $("resultTitle").value,
      content: $("resultBody").value,
      sourceSite: currentResult.sourceSite,
      summarized: currentResult.summarized,
    },
  });
  if (res.ok) {
    setStatus("Saved.", "ok");
    await refreshLibrary();
  }
});

$("btnUpdate").addEventListener("click", async () => {
  if (!editingId) return;
  await send("UPDATE_CONTEXT", {
    id: editingId,
    patch: { title: $("editTitle").value, content: $("editBody").value },
  });
  await refreshLibrary();
  setStatus("Updated.", "ok");
});

$("btnDelete").addEventListener("click", async () => {
  if (!editingId) return;
  await send("DELETE_CONTEXT", { id: editingId });
  editingId = null;
  $("editCard").hidden = true;
  await refreshLibrary();
  setStatus("Deleted.", "ok");
});

$("btnEditCopy").addEventListener("click", async () => {
  await copyText($("editBody").value);
  setStatus("Copied to clipboard.", "ok");
});

$("btnEditDownload").addEventListener("click", () => {
  downloadMarkdown(slug($("editTitle").value) + ".md", $("editBody").value);
});

$("btnExport").addEventListener("click", async () => {
  const res = await send("GET_CONTEXTS");
  const blob = new Blob([JSON.stringify(res.contexts || [], null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "context-carry-export.json";
  a.click();
  URL.revokeObjectURL(url);
});

$("btnImport").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const list = Array.isArray(parsed) ? parsed : parsed.contexts;
    const res = await send("IMPORT_CONTEXTS", { contexts: list });
    if (!res.ok) throw new Error(res.error || "Import failed.");
    await refreshLibrary();
    setStatus("Imported.", "ok");
  } catch (err) {
    setStatus(err.message || String(err), "err");
  } finally {
    e.target.value = "";
  }
});

$("btnSettings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

$("btnOnboarding").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/ui/onboarding.html") });
});

$("btnDump").addEventListener("click", async () => {
  setStatus("Copying a sanitized page structure (no message content)…");
  try {
    const res = await send("DUMP_STRUCTURE");
    if (!res.ok) throw new Error(res.error);
    await copyText(JSON.stringify(res.dump, null, 2));
    setStatus("Page structure copied. Paste it when reporting a broken adapter.", "ok");
  } catch (err) {
    setStatus(err.message || String(err), "err");
  }
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshPage();
});

chrome.tabs.onActivated.addListener(() => refreshPage());
chrome.tabs.onUpdated.addListener((_id, change) => {
  if (change.status === "complete" || change.url) refreshPage();
});

refreshPage();
refreshKeysBanner();
refreshLibrary();
