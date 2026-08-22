const ContextCarryProviders = (() => {
  function trimSlash(url) {
    return String(url || "").replace(/\/+$/, "");
  }

  function humanizeProviderError(providerName, status, bodyText) {
    const text = String(bodyText || "").slice(0, 800);
    let parsed = null;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      parsed = null;
    }
    const msg =
      parsed?.error?.message ||
      parsed?.error ||
      parsed?.message ||
      text ||
      `HTTP ${status}`;

    const lower = String(msg).toLowerCase();
    if (status === 401 || status === 403) {
      return `${providerName} rejected the API key. Check it in Settings.`;
    }
    if (status === 429) {
      return `${providerName} rate-limited the request. Wait a moment and try again, or add another provider.`;
    }
    if (
      /model|deprecat|does not exist|not found|no longer/i.test(lower) &&
      /model/i.test(lower)
    ) {
      return `The configured model for ${providerName} is no longer available — update it in Settings.`;
    }
    if (status >= 500) {
      return `${providerName} is having an outage. Trying the next provider if one is configured.`;
    }
    return `${providerName} failed: ${String(msg).slice(0, 220)}`;
  }

  async function postJson(url, headers, body) {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    let json = null;
    try {
      json = raw ? JSON.parse(raw) : {};
    } catch {
      json = null;
    }
    return { res, raw, json };
  }

  async function callOpenAICompatible({
    name,
    url,
    key,
    model,
    messages,
    extraHeaders,
  }) {
    const { res, raw, json } = await postJson(
      url,
      {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        ...(extraHeaders || {}),
      },
      {
        model,
        messages,
        temperature: 0.2,
      }
    );
    if (!res.ok) {
      throw new Error(humanizeProviderError(name, res.status, raw));
    }
    const content = json?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`${name} returned an empty response.`);
    }
    return String(content).trim();
  }

  async function callAnthropic({ name, url, key, model, messages }) {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const converted = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));

    const { res, raw, json } = await postJson(
      url || "https://api.anthropic.com/v1/messages",
      {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      {
        model,
        max_tokens: 4096,
        system: system || undefined,
        messages: converted,
      }
    );
    if (!res.ok) {
      throw new Error(humanizeProviderError(name, res.status, raw));
    }
    const text = (json?.content || [])
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("\n")
      .trim();
    if (!text) throw new Error(`${name} returned an empty response.`);
    return text;
  }

  function groqConfig(settings) {
    if (!settings.groqKey) return null;
    return {
      id: "groq",
      name: "Groq",
      type: "openai",
      key: settings.groqKey,
      model: settings.groqModel || "openai/gpt-oss-120b",
      url: "https://api.groq.com/openai/v1/chat/completions",
    };
  }

  function openrouterConfig(settings) {
    if (!settings.openrouterKey) return null;
    return {
      id: "openrouter",
      name: "OpenRouter",
      type: "openai",
      key: settings.openrouterKey,
      model: settings.openrouterModel || "openrouter/free",
      url: "https://openrouter.ai/api/v1/chat/completions",
      extraHeaders: {
        "HTTP-Referer": "https://github.com/context-carry/extension",
        "X-Title": "Context Carry",
      },
    };
  }

  function customConfigs(settings) {
    return (settings.customProviders || [])
      .filter((p) => p && p.key && p.model)
      .map((p) => ({
        id: p.id,
        name: p.name || "Custom provider",
        type: p.type === "anthropic" ? "anthropic" : "openai",
        key: p.key,
        model: p.model,
        url:
          p.type === "anthropic"
            ? p.endpoint || "https://api.anthropic.com/v1/messages"
            : completionsUrl(p.endpoint),
      }));
  }

  function completionsUrl(endpoint) {
    const base = trimSlash(endpoint || "https://api.openai.com/v1");
    if (/\/chat\/completions$/i.test(base)) return base;
    return `${base}/chat/completions`;
  }

  function failoverChain(settings) {
    return [groqConfig(settings), openrouterConfig(settings), ...customConfigs(settings)].filter(
      Boolean
    );
  }

  async function callLLM(provider, messages) {
    if (provider.type === "anthropic") {
      return callAnthropic({
        name: provider.name,
        url: provider.url,
        key: provider.key,
        model: provider.model,
        messages,
      });
    }
    return callOpenAICompatible({
      name: provider.name,
      url: provider.url,
      key: provider.key,
      model: provider.model,
      messages,
      extraHeaders: provider.extraHeaders,
    });
  }

  async function testProvider(provider) {
    const text = await callLLM(provider, [
      {
        role: "user",
        content: "Reply with the single word: ok",
      },
    ]);
    return { ok: true, sample: text.slice(0, 80) };
  }

  return {
    failoverChain,
    callLLM,
    testProvider,
    groqConfig,
    openrouterConfig,
    completionsUrl,
  };
})();
