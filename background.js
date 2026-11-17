// BACKGROUND: three small jobs that can't run inside a web page.
// 1. Talks to the Gemini API for the cat (the free key route), streaming the
//    answer back piece by piece.
// 2. Opens the helper tab for "your own account" answers on ChatGPT, Gemini
//    and Grok (see helper.js), and passes messages between it and your tab.
// 3. "Wake the cat here": clicking the extension's icon on any other site
//    loads the cat on that tab.

const FILES = ["store.js", "sites.js", "helper.js", "claude.js", "ai.js", "brain.js", "theme.js", "markdown.js", "logo-data.js", "cat-roll.js", "shell.js"];

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "cat-gemini") return;
  const ctrl = new AbortController();
  port.onDisconnect.addListener(() => ctrl.abort());
  port.onMessage.addListener(async ({ key, model, contents }) => {
    try {
      const url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":streamGenerateContent?alt=sse";
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        let msg = "";
        try { const j = await res.json(); msg = (j.error && j.error.message) || ""; } catch (e) {}
        if (res.status === 400 && /API key/i.test(msg)) msg = "That Gemini key didn't work. Check it with /key.";
        if (res.status === 429) msg = "The free Gemini limit is used up for now. Try again in a minute.";
        port.postMessage({ error: msg || "Gemini request failed (status " + res.status + ")" });
        return;
      }
      // The answer arrives as lines starting with "data:", each holding a
      // small piece of JSON with the next bit of text.
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          try {
            const j = JSON.parse(line.slice(5));
            const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
            const t = parts.map((p) => p.text || "").join("");
            if (t) port.postMessage({ delta: t });
          } catch (e) {}
        }
      }
      port.postMessage({ done: true });
    } catch (e) {
      if (e.name !== "AbortError") try { port.postMessage({ error: String(e.message || e) }); } catch (e2) {}
    }
  });
});

// ---- helper tabs ----
// asker port (your chat tab) <-> worker port (the helper tab), by helper tab id.
const helpers = new Map();
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.type === "cat-helper-hello") reply({ helper: !!(sender.tab && helpers.has(sender.tab.id)) });
});
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "cat-helper") {
    let tabId = null, closed = false;
    port.onMessage.addListener(async (m) => {
      if (m.open) {
        try {
          const from = port.sender && port.sender.tab;
          const tab = await chrome.tabs.create({ url: m.open, active: false, windowId: from ? from.windowId : undefined });
          if (closed) { chrome.tabs.remove(tab.id).catch(() => {}); return; }
          tabId = tab.id;
          helpers.set(tabId, { asker: port, worker: null, queue: [] });
        } catch (e) { try { port.postMessage({ error: "couldn't open a helper tab" }); } catch (e2) {} }
        return;
      }
      const h = tabId != null && helpers.get(tabId);
      if (!h) return;
      if (h.worker) h.worker.postMessage(m); else h.queue.push(m);
    });
    port.onDisconnect.addListener(() => {
      closed = true;
      if (tabId != null) { helpers.delete(tabId); chrome.tabs.remove(tabId).catch(() => {}); }
    });
    return;
  }
  if (port.name === "cat-helper-worker") {
    const tabId = port.sender && port.sender.tab && port.sender.tab.id;
    const h = helpers.get(tabId);
    if (!h) { port.disconnect(); return; }
    h.worker = port;
    port.onMessage.addListener((m) => { try { h.asker.postMessage(m); } catch (e) {} });
    for (const m of h.queue.splice(0)) port.postMessage(m);
    port.onDisconnect.addListener(() => { if (helpers.get(tabId) === h) h.worker = null; });
  }
});
// If someone closes the helper tab by hand, tell the asker so it can fall back.
chrome.tabs.onRemoved.addListener((tabId) => {
  const h = helpers.get(tabId);
  if (!h) return;
  helpers.delete(tabId);
  try { h.asker.postMessage({ error: "the helper tab was closed" }); h.asker.disconnect(); } catch (e) {}
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !/^https?:/.test(tab.url || "")) return;
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => !!document.getElementById("cat-ext-host") });
    if (r && r.result) return; // the cat is already here
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: FILES });
  } catch (e) {
    console.warn("Could not wake the cat on this page:", e);
  }
});
