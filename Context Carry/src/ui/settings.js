const $ = (id) => document.getElementById(id);

async function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
}

let settings = null;

async function load() {
  const res = await send("GET_SETTINGS");
  settings = res.settings;
  $("groqKey").value = settings.groqKey || "";
  $("groqModel").value = settings.groqModel || "openai/gpt-oss-120b";
  $("openrouterKey").value = settings.openrouterKey || "";
  $("openrouterModel").value = settings.openrouterModel || "openrouter/free";
  renderCustom();
}

function renderCustom() {
  const list = $("customList");
  list.innerHTML = "";
  (settings.customProviders || []).forEach((p, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "card";
    wrap.style.background = "var(--bg-2)";
    wrap.innerHTML = `
      <label class="field"><span>Name</span><input type="text" data-f="name" /></label>
      <label class="field"><span>Type</span>
        <select data-f="type">
          <option value="openai">OpenAI-compatible</option>
          <option value="anthropic">Anthropic</option>
        </select>
      </label>
      <label class="field"><span>Endpoint</span><input type="url" data-f="endpoint" placeholder="https://api.openai.com/v1" /></label>
      <label class="field"><span>Model</span><input type="text" data-f="model" /></label>
      <label class="field"><span>API key</span><input type="password" data-f="key" autocomplete="off" /></label>
      <div class="row">
        <button class="btn btn-primary save">Save</button>
        <button class="btn test">Test</button>
        <button class="btn btn-danger del">Remove</button>
        <span class="muted status"></span>
      </div>
    `;
    wrap.querySelector('[data-f="name"]').value = p.name || "";
    wrap.querySelector('[data-f="type"]').value = p.type || "openai";
    wrap.querySelector('[data-f="endpoint"]').value = p.endpoint || "";
    wrap.querySelector('[data-f="model"]').value = p.model || "";
    wrap.querySelector('[data-f="key"]').value = p.key || "";

    const read = () => ({
      id: p.id,
      name: wrap.querySelector('[data-f="name"]').value,
      type: wrap.querySelector('[data-f="type"]').value,
      endpoint: wrap.querySelector('[data-f="endpoint"]').value,
      model: wrap.querySelector('[data-f="model"]').value,
      key: wrap.querySelector('[data-f="key"]').value,
    });

    wrap.querySelector(".save").addEventListener("click", async () => {
      const next = [...settings.customProviders];
      next[idx] = read();
      await maybeRequestOrigin(next[idx].endpoint);
      settings = (await send("SAVE_SETTINGS", { patch: { customProviders: next } })).settings;
      wrap.querySelector(".status").textContent = "Saved.";
      wrap.querySelector(".status").className = "muted status ok";
    });

    wrap.querySelector(".test").addEventListener("click", async () => {
      const next = [...settings.customProviders];
      next[idx] = read();
      settings = await (await send("SAVE_SETTINGS", { patch: { customProviders: next } })).settings;
      const status = wrap.querySelector(".status");
      status.textContent = "Testing…";
      try {
        const res = await send("TEST_PROVIDER", { target: p.id });
        if (!res.ok) throw new Error(res.error);
        status.textContent = "Key works.";
        status.className = "muted status ok";
      } catch (err) {
        status.textContent = err.message || String(err);
        status.className = "muted status err";
      }
    });

    wrap.querySelector(".del").addEventListener("click", async () => {
      const next = settings.customProviders.filter((x) => x.id !== p.id);
      settings = await (await send("SAVE_SETTINGS", { patch: { customProviders: next } })).settings;
      renderCustom();
    });

    list.appendChild(wrap);
  });
}

$("saveGroq").addEventListener("click", async () => {
  settings = (
    await send("SAVE_SETTINGS", {
      patch: { groqKey: $("groqKey").value.trim(), groqModel: $("groqModel").value.trim() },
    })
  ).settings;
  $("groqStatus").textContent = "Saved.";
  $("groqStatus").className = "muted ok";
});

$("saveOpenrouter").addEventListener("click", async () => {
  settings = (
    await send("SAVE_SETTINGS", {
      patch: {
        openrouterKey: $("openrouterKey").value.trim(),
        openrouterModel: $("openrouterModel").value.trim(),
      },
    })
  ).settings;
  $("orStatus").textContent = "Saved.";
  $("orStatus").className = "muted ok";
});

async function test(target, el) {
  el.textContent = "Testing…";
  el.className = "muted";
  try {
    if (target === "groq") {
      await send("SAVE_SETTINGS", {
        patch: { groqKey: $("groqKey").value.trim(), groqModel: $("groqModel").value.trim() },
      });
    }
    if (target === "openrouter") {
      await send("SAVE_SETTINGS", {
        patch: {
          openrouterKey: $("openrouterKey").value.trim(),
          openrouterModel: $("openrouterModel").value.trim(),
        },
      });
    }
    const res = await send("TEST_PROVIDER", { target });
    if (!res.ok) throw new Error(res.error);
    el.textContent = "Key works.";
    el.className = "muted ok";
  } catch (err) {
    el.textContent = err.message || String(err);
    el.className = "muted err";
  }
}

$("testGroq").addEventListener("click", () => test("groq", $("groqStatus")));
$("testOpenrouter").addEventListener("click", () => test("openrouter", $("orStatus")));

async function maybeRequestOrigin(endpoint) {
  try {
    const origin = new URL(endpoint).origin;
    if (!origin || origin === "null") return;
    await chrome.permissions.request({ origins: [origin + "/*"] });
  } catch {
    /* ignore invalid URLs */
  }
}

$("addCustom").addEventListener("click", async () => {
  const next = [
    ...(settings.customProviders || []),
    {
      id: uid(),
      name: "Custom",
      type: "openai",
      endpoint: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      key: "",
    },
  ];
  settings = (await send("SAVE_SETTINGS", { patch: { customProviders: next } })).settings;
  renderCustom();
});

load();
