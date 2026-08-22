# Context Carry

Browser extension that captures an in-progress ChatGPT, Claude, or Gemini conversation and turns it into a portable handoff you can paste into any new chat.

When you hit a usage limit or a context-window ceiling, you should not have to re-explain the project. Context Carry records **what you wanted**, **what was decided**, **what is done**, and **what is left**.

Local-first: no account, no server. Your chats and API keys stay in `chrome.storage.local` on this device. Summarization uses **your** keys (bring-your-own-key).

## Install (unpacked)

1. Open `chrome://extensions` (Chrome, Edge, Brave, Arc).
2. Turn on **Developer mode**.
3. **Load unpacked** and select this folder.
4. Pin Context Carry. Click the icon to open the **side panel**.
5. Complete the setup tab (or skip and add keys later in Settings).

## Get API keys

Summaries need at least one key. Failover order:

1. **Groq** (primary) — [console.groq.com/keys](https://console.groq.com/keys)
2. **OpenRouter** (fallback) — [openrouter.ai/keys](https://openrouter.ai/keys)
3. Any custom OpenAI-compatible or Anthropic provider you add in Settings

Default models (editable in Settings, because free-tier IDs change):

- Groq: `openai/gpt-oss-120b`
- OpenRouter: `openrouter/free`

If every provider fails, you still get a **raw transcript**, labeled as unsummarized.

## Daily use

1. Open a conversation on ChatGPT (`chatgpt.com`), Claude (`claude.ai`), or Gemini (`gemini.google.com`).
2. Open the side panel.
3. **Last exchange** — last user message and everything after it (fast).
4. **Summarize full chat** — scrolls to load virtualized history first; can take several seconds on long threads.
5. **Use selected text** — works on any site if auto-capture fails. Highlight the conversation, then click.
6. Copy or download Markdown, or save with a title. Edit and delete from the library. Export/import JSON to move data between browsers.

## Privacy

- No sign-in and no first-party backend.
- Conversation text leaves the device only when you capture, and only to the LLM provider whose key you entered.
- **Copy page structure** copies tag names, test IDs, roles, class names, and text *lengths* — not message content — so adapters can be fixed when a site changes its DOM.

## Architecture

```
manifest.json          MV3, side panel, content scripts
src/background.js      routing, summarization, storage
src/lib/               local storage, providers, summary prompt
src/adapters/          one file per site + shared helpers
src/content-bridge.js  scrape / selection / debug dump
src/ui/                side panel, settings, onboarding
```

Shared helpers (`src/adapters/_contract.js`) do not use `this` internally, so adapters can destructure them without breaking `sleep` / auto-scroll. Text is read with `textContent` (cloned nodes have no layout; `innerText` would be empty).

### Adapter contract

Each site file sets:

```js
window.__contextCarryAdapter = {
  name: "chatgpt",
  scrape: async (mode) => ({ ok, messages, site, warning }),
  dump: () => ({ ...sanitized structure... }),
};
```

`mode` is `"full"` or `"last"`. Messages are `{ role: "user"|"assistant", text }`.

When ChatGPT, Claude, or Gemini breaks, open a real conversation, use **Copy page structure**, and adjust that one adapter file.

## Out of scope (v0.1)

Cross-device sync (use export/import), Firefox/Safari packages, automated adapter monitoring, paid hosted summarization.

## License

MIT
