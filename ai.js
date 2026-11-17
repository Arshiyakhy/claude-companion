// AI: where the cat's own answers come from. Two ways:
//   "account"  on claude.ai, your own Claude account answers, in a hidden chat
//              that is deleted afterward (free, same AI you're talking to)
//   "key"      everywhere else, Google's Gemini answers, using a free API key
//              you paste once (get one at aistudio.google.com/apikey)
// Both look the same to the rest of the extension: open a session, send
// prompts, get the answer as it streams, end the session.
(function () {
  const CatExt = (window.CatExt = window.CatExt || {});
  const DEFAULT_MODEL = "gemini-flash-latest";

  async function settings() {
    const r = await chrome.storage.local.get("cat_settings");
    return Object.assign({ geminiKey: "", model: DEFAULT_MODEL }, (r && r.cat_settings) || {});
  }
  async function saveSettings(patch) {
    const s = Object.assign(await settings(), patch);
    await chrome.storage.local.set({ cat_settings: s });
    return s;
  }

  // Used when no key is saved yet; the shell shows the key setup and retries.
  class NeedsKey extends Error { constructor() { super("Add a free Gemini key to use the cat on this site."); this.needsKey = true; } }

  // ---- your Claude account (claude.ai only) ----
  function accountSession() {
    const C = CatExt.claude;
    let org = null, conv = null, parent = null;
    return {
      who: "Claude (your account)",
      async send(prompt, onDelta) {
        if (!org) org = await C.getOrgId();
        if (!conv) conv = await C.createConversation(org);
        const r = await C.ask({ org, convId: conv, prompt, parent, onDelta });
        parent = r.messageUuid;
        return r.text;
      },
      end() { if (org && conv) C.deleteConversation(org, conv); conv = null; },
      // A kept chat, for /clone and /fork: returns its id.
      async newKeptChat(name, prompt, onDelta) {
        const o = await C.getOrgId();
        const id = await C.createConversation(o, name);
        await C.ask({ org: o, convId: id, prompt, onDelta });
        return id;
      },
    };
  }

  // ---- a free Gemini key (every other site) ----
  // The request goes through the extension's background worker, so the chat
  // site's own security rules can't block it.
  function streamGemini(key, model, contents, onDelta) {
    return new Promise((resolve, reject) => {
      const port = chrome.runtime.connect({ name: "cat-gemini" });
      let text = "";
      port.onMessage.addListener((m) => {
        if (m.delta) { text += m.delta; onDelta && onDelta(text); }
        if (m.error) { port.disconnect(); reject(new Error(m.error)); }
        if (m.done) { port.disconnect(); text ? resolve(text) : reject(new Error("Gemini answered, but with no text.")); }
      });
      port.postMessage({ key, model, contents });
    });
  }
  function keySession(s) {
    const history = [];
    return {
      who: "Gemini (free key)",
      async send(prompt, onDelta) {
        history.push({ role: "user", parts: [{ text: prompt }] });
        try {
          const text = await streamGemini(s.geminiKey, s.model, history, onDelta);
          history.push({ role: "model", parts: [{ text }] });
          return text;
        } catch (e) { history.pop(); throw e; }
      },
      end() {},
    };
  }

  async function session() {
    if (CatExt.site.account) return accountSession();
    const s = await settings();
    if (!s.geminiKey) throw new NeedsKey();
    return keySession(s);
  }

  // One question, one answer, then the session is closed.
  async function once(prompt, onDelta) {
    const s = await session();
    try { return await s.send(prompt, onDelta); } finally { s.end(); }
  }

  CatExt.ai = { session, once, settings, saveSettings, accountSession };
})();
