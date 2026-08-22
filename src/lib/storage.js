const ContextCarryStorage = (() => {
  const SETTINGS_KEY = "settings";
  const CONTEXTS_KEY = "contexts";

  const DEFAULT_SETTINGS = {
    groqKey: "",
    groqModel: "openai/gpt-oss-120b",
    openrouterKey: "",
    openrouterModel: "openrouter/free",
    customProviders: [],
    onboardingComplete: false,
  };

  async function getSettings() {
    const data = await chrome.storage.local.get(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
  }

  async function saveSettings(partial) {
    const current = await getSettings();
    const next = { ...current, ...partial };
    await chrome.storage.local.set({ [SETTINGS_KEY]: next });
    return next;
  }

  async function getContexts() {
    const data = await chrome.storage.local.get(CONTEXTS_KEY);
    return data[CONTEXTS_KEY] || [];
  }

  async function saveContexts(contexts) {
    await chrome.storage.local.set({ [CONTEXTS_KEY]: contexts });
    return contexts;
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  async function addContext(entry) {
    const contexts = await getContexts();
    const now = Date.now();
    const record = {
      id: entry.id || uuid(),
      title: (entry.title || "Untitled context").trim(),
      content: entry.content || "",
      sourceSite: entry.sourceSite || "unknown",
      summarized: Boolean(entry.summarized),
      createdAt: now,
      updatedAt: now,
    };
    contexts.unshift(record);
    await saveContexts(contexts);
    return record;
  }

  async function updateContext(id, patch) {
    const contexts = await getContexts();
    const idx = contexts.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error("Context not found.");
    contexts[idx] = {
      ...contexts[idx],
      ...patch,
      id,
      updatedAt: Date.now(),
    };
    await saveContexts(contexts);
    return contexts[idx];
  }

  async function deleteContext(id) {
    const contexts = await getContexts();
    await saveContexts(contexts.filter((c) => c.id !== id));
  }

  async function importContexts(incoming) {
    if (!Array.isArray(incoming)) {
      throw new Error("Import file must contain an array of contexts.");
    }
    const existing = await getContexts();
    const byId = new Map(existing.map((c) => [c.id, c]));
    for (const item of incoming) {
      if (!item || !item.id) continue;
      const prev = byId.get(item.id);
      if (!prev) {
        byId.set(item.id, {
          id: item.id,
          title: item.title || "Untitled context",
          content: item.content || "",
          sourceSite: item.sourceSite || "unknown",
          summarized: Boolean(item.summarized),
          createdAt: item.createdAt || Date.now(),
          updatedAt: item.updatedAt || Date.now(),
        });
      } else if ((item.updatedAt || 0) > (prev.updatedAt || 0)) {
        byId.set(item.id, { ...prev, ...item, id: item.id });
      }
    }
    const merged = Array.from(byId.values()).sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
    );
    await saveContexts(merged);
    return merged;
  }

  return {
    DEFAULT_SETTINGS,
    getSettings,
    saveSettings,
    getContexts,
    addContext,
    updateContext,
    deleteContext,
    importContexts,
    uuid,
  };
})();
