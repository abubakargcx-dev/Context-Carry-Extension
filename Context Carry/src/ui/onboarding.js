async function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

async function init() {
  const res = await send("GET_SETTINGS");
  document.getElementById("groqKey").value = res.settings.groqKey || "";
  document.getElementById("openrouterKey").value = res.settings.openrouterKey || "";
}

document.getElementById("saveGroq").addEventListener("click", async () => {
  await send("SAVE_SETTINGS", {
    patch: { groqKey: document.getElementById("groqKey").value.trim() },
  });
  const el = document.getElementById("groqMsg");
  el.textContent = "Saved on this device.";
  el.className = "muted ok";
});

document.getElementById("saveOr").addEventListener("click", async () => {
  await send("SAVE_SETTINGS", {
    patch: { openrouterKey: document.getElementById("openrouterKey").value.trim() },
  });
  const el = document.getElementById("orMsg");
  el.textContent = "Saved on this device.";
  el.className = "muted ok";
});

async function complete() {
  await send("SAVE_SETTINGS", {
    patch: {
      groqKey: document.getElementById("groqKey").value.trim(),
      openrouterKey: document.getElementById("openrouterKey").value.trim(),
      onboardingComplete: true,
    },
  });
  document.getElementById("doneMsg").hidden = false;
}

document.getElementById("finish").addEventListener("click", complete);
document.getElementById("skip").addEventListener("click", complete);

init();
