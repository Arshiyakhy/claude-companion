// HELPER: lets the cat answer with your own account on ChatGPT, Gemini and Grok,
// the way it does on Claude, without a key.
//
// How: the cat opens a second tab of the same site in the background (on
// ChatGPT a temporary chat, which isn't saved), types the side question into
// that tab's message box, reads the answer as it appears, and closes the tab
// when the side chat ends. The site sees a normal chat in a normal tab.
//
// Two halves live in this file:
//   the asker   runs in your chat tab and opens the helper (session())
//   the worker  runs in the helper tab: types, sends, reads the answer
// The background worker (background.js) connects the two.
//
// Sites change their pages, so this can break. When it does, ai.js falls back
// to the free Gemini key on its own.
(function () {
  const CatExt = (window.CatExt = window.CatExt || {});
  if (CatExt.helper) return;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => !!el && el.getClientRects().length > 0;

  // Is this tab a helper? Asked first thing, so the cat stays out of it.
  CatExt.helperCheck = new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: "cat-helper-hello" }, (r) => {
        void chrome.runtime.lastError;
        resolve(!!(r && r.helper));
      });
    } catch (e) { resolve(false); }
    setTimeout(() => resolve(false), 1500);
  });

  // ---------- reading an answer as markdown ----------
  // The page shows answers as HTML. markdown.js shows them back nicely, so
  // turn the main shapes (code blocks, lists, bold, headings) into markdown.
  function toMarkdown(root) {
    const out = [];
    function inline(node) {
      let s = "";
      for (const n of node.childNodes) {
        if (n.nodeType === 3) { s += n.nodeValue; continue; }
        if (n.nodeType !== 1) continue;
        const t = n.tagName;
        if (t === "BUTTON" || t === "SVG" || t === "svg" || n.getAttribute("aria-hidden") === "true") continue;
        if (t === "STRONG" || t === "B") s += "**" + inline(n) + "**";
        else if (t === "EM" || t === "I") s += "*" + inline(n) + "*";
        else if (t === "CODE") s += "`" + n.textContent + "`";
        else if (t === "BR") s += "\n";
        else s += inline(n);
      }
      return s;
    }
    function block(node, depth) {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) { if (n.nodeValue.trim()) out.push(n.nodeValue.trim()); continue; }
        if (n.nodeType !== 1) continue;
        const t = n.tagName;
        if (t === "BUTTON" || t === "svg" || t === "SVG" || n.getAttribute("aria-hidden") === "true") continue;
        if (t === "PRE") {
          const code = n.querySelector("code") || n;
          out.push("```\n" + code.textContent.replace(/\n$/, "") + "\n```");
        } else if (/^H[1-6]$/.test(t)) out.push("#".repeat(+t[1]) + " " + inline(n).trim());
        else if (t === "UL" || t === "OL") {
          let i = 1;
          for (const li of n.children) {
            if (li.tagName !== "LI") continue;
            const nested = li.querySelector("ul, ol");
            const own = li.cloneNode(true);
            own.querySelectorAll("ul, ol").forEach((x) => x.remove());
            out.push("  ".repeat(depth) + (t === "OL" ? i++ + ". " : "- ") + inline(own).trim());
            if (nested) block({ childNodes: [nested] }, depth + 1);
          }
        } else if (t === "P" || t === "BLOCKQUOTE") out.push((t === "BLOCKQUOTE" ? "> " : "") + inline(n).trim());
        else if (t === "TABLE") out.push(n.innerText.trim());
        else block(n, depth);
      }
    }
    block(root, 0);
    return out.filter(Boolean).join("\n\n").trim() || (root.innerText || "").trim();
  }

  // ---------- the worker: runs inside the helper tab ----------
  function stopShowing() {
    return [...document.querySelectorAll('button, [role="button"]')].some((b) => {
      if (!visible(b)) return false;
      const label = (b.getAttribute("aria-label") || "") + " " + (b.getAttribute("data-testid") || "");
      return /stop/i.test(label);
    });
  }
  async function waitFor(fn, ms) {
    const end = Date.now() + ms;
    for (;;) {
      let v = null;
      try { v = fn(); } catch (e) {}
      if (v) return v;
      if (Date.now() > end) return null;
      await sleep(250);
    }
  }
  // Gemini and Grok save chats unless a "temporary" or "private" chat is on.
  // If the page has that switch and it's off, turn it on. If not, carry on.
  async function goTemporary(site) {
    if (site.id === "chatgpt") return; // ChatGPT's helper tab already opens a temporary chat
    const btn = [...document.querySelectorAll('button, a, [role="button"]')].find((b) => {
      const label = (b.getAttribute("aria-label") || "") + " " + (b.getAttribute("data-test-id") || "") + " " + (b.textContent || "");
      return visible(b) && /temporary chat|private chat|private/i.test(label) && b.getAttribute("aria-pressed") !== "true" && b.getAttribute("aria-checked") !== "true";
    });
    if (btn) { btn.click(); await sleep(1500); }
  }
  async function press(site) {
    const box = site.composer();
    const btn = await waitFor(() => {
      const b = (site.sendButton && site.sendButton()) ||
        [...document.querySelectorAll("button")].find((x) => visible(x) && /send|submit/i.test((x.getAttribute("aria-label") || "") + " " + (x.getAttribute("data-testid") || "")));
      return b && !b.disabled && b.getAttribute("aria-disabled") !== "true" ? b : null;
    }, 4000);
    if (btn) { btn.click(); return; }
    // No button found: press Enter in the box, like a person would.
    if (box) {
      box.focus();
      for (const type of ["keydown", "keypress", "keyup"]) {
        box.dispatchEvent(new KeyboardEvent(type, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      }
    }
  }
  async function askHere(site, prompt, port) {
    const answers = () => (site.answers ? [...site.answers()] : []);
    const box = await waitFor(() => site.composer(), 5000);
    if (!box) throw new Error("couldn't find the message box");
    const before = answers().length;
    if (!site.insert(prompt)) throw new Error("couldn't type into the message box");
    await sleep(300);
    await press(site);
    // Wait for the new answer to appear, then read it until it stops changing.
    const el = await waitFor(() => answers().length > before && answers()[answers().length - 1], 30000);
    if (!el) throw new Error("the answer never started");
    let last = "", stableSince = Date.now();
    const end = Date.now() + 180000;
    for (;;) {
      const cur = answers()[answers().length - 1] || el;
      const text = toMarkdown(cur);
      if (text !== last) { last = text; stableSince = Date.now(); if (text) port.postMessage({ text }); }
      if (last && !stopShowing() && Date.now() - stableSince > 1800) return last;
      if (Date.now() > end) { if (last) return last; throw new Error("the answer took too long"); }
      await sleep(300);
    }
  }
  CatExt.helperCheck.then(async (isHelper) => {
    if (!isHelper) return;
    const site = CatExt.site;
    const port = chrome.runtime.connect({ name: "cat-helper-worker" });
    let queue = Promise.resolve();
    let first = true;
    port.onMessage.addListener((m) => {
      if (!m.prompt) return;
      queue = queue.then(async () => {
        try {
          if (first) {
            first = false;
            if (!(await waitFor(() => site.composer(), 15000))) throw new Error("couldn't find the message box, maybe you're logged out");
            await goTemporary(site);
          }
          const text = await askHere(site, m.prompt, port);
          port.postMessage({ done: true, text });
        } catch (e) {
          port.postMessage({ error: String((e && e.message) || e) });
        }
      });
    });
    port.postMessage({ ready: true });
  });

  // ---------- the asker: runs in your chat tab ----------
  // A session like the others in ai.js: send(prompt, onDelta), end().
  function session(site) {
    let port = null, ready = null, pending = null;
    function open() {
      if (ready) return ready;
      port = chrome.runtime.connect({ name: "cat-helper" });
      ready = new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("the " + site.name + " tab didn't load in time")), 30000);
        port.onMessage.addListener((m) => {
          if (m.ready) { clearTimeout(t); resolve(); return; }
          if (!pending) { if (m.error) { clearTimeout(t); reject(new Error(m.error)); } return; }
          if (m.text && !m.done) pending.onDelta && pending.onDelta(m.text);
          if (m.done) { const p = pending; pending = null; p.resolve(m.text); }
          if (m.error) { const p = pending; pending = null; p.reject(new Error(m.error)); }
        });
        port.onDisconnect.addListener(() => {
          clearTimeout(t);
          const err = new Error("the " + site.name + " tab closed");
          reject(err);
          if (pending) { const p = pending; pending = null; p.reject(err); }
        });
      });
      port.postMessage({ open: site.helperUrl });
      return ready;
    }
    return {
      who: site.name + " (your account)",
      async send(prompt, onDelta) {
        await open();
        return new Promise((resolve, reject) => {
          pending = { resolve, reject, onDelta };
          port.postMessage({ prompt });
        });
      },
      end() { try { port && port.disconnect(); } catch (e) {} port = null; ready = null; },
    };
  }

  CatExt.helper = { session, toMarkdown };
})();
