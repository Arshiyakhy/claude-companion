// SITES: the only part that knows which AI chat site we are on.
// Each adapter answers these questions:
//   chatKey()   which chat is open (changes when you switch chats)
//   read()      the messages of the open chat, as [{role: "you" | "ai", text}]
//   composer()  the site's own message box, so the cat can put text into it
//   newChat     the address of a fresh chat on this site
//   answers()   the AI's answers on the page (the helper tab reads the newest)
//   helperUrl   where the helper tab opens, for answers from your own account
// Sites change their pages now and then. When one breaks, its adapter below
// is the place to fix, and nothing else needs to change.
(function () {
  const CatExt = (window.CatExt = window.CatExt || {});
  const textOf = (el) => (el ? (el.innerText || el.textContent || "").trim() : "");
  const visible = (el) => !!el && el.getClientRects().length > 0;

  // Turns a list of elements into messages, given a test for "you wrote this".
  // Answers are read as markdown when helper.js is loaded, so code blocks stay code blocks.
  const md = (el) => (el && CatExt.helper ? CatExt.helper.toMarkdown(el) : textOf(el));
  const turnsFrom = (els, isYou, inner) =>
    [...els].map((el) => ({ role: isYou(el) ? "you" : "ai", text: md(inner ? el.querySelector(inner) || el : el) })).filter((m) => m.text);

  const ADAPTERS = [
    {
      id: "claude", name: "Claude", account: true,
      match: (h) => /(^|\.)claude\.ai$/.test(h),
      chatKey: () => CatExt.claude.conversationId(),
      read: () => CatExt.claude.getMainChat(),
      composer: () => document.querySelector('[contenteditable="true"].ProseMirror') || document.querySelector('div[contenteditable="true"]'),
      newChat: "/new",
    },
    {
      id: "chatgpt", name: "ChatGPT",
      match: (h) => /(^|\.)(chatgpt\.com|chat\.openai\.com)$/.test(h),
      turns: () => turnsFrom(document.querySelectorAll("[data-message-author-role]"), (el) => el.getAttribute("data-message-author-role") === "user"),
      composer: () => document.querySelector("#prompt-textarea") || document.querySelector('[contenteditable="true"]'),
      answers: () => document.querySelectorAll('[data-message-author-role="assistant"]'),
      sendButton: () => document.querySelector('[data-testid="send-button"], #composer-submit-button'),
      helperUrl: "https://chatgpt.com/?temporary-chat=true",
      newChat: "/",
    },
    {
      id: "gemini", name: "Gemini",
      match: (h) => h === "gemini.google.com",
      turns: () => turnsFrom(document.querySelectorAll("user-query, model-response"), (el) => el.tagName === "USER-QUERY", ".query-text, message-content"),
      composer: () => document.querySelector('rich-textarea [contenteditable="true"]') || document.querySelector('.ql-editor[contenteditable="true"]'),
      answers: () => document.querySelectorAll("model-response message-content"),
      sendButton: () => document.querySelector('button.send-button, button[aria-label*="Send" i]'),
      helperUrl: "https://gemini.google.com/app",
      newChat: "/app",
    },
    {
      id: "grok", name: "Grok",
      match: (h) => /(^|\.)grok\.com$/.test(h),
      turns: () => turnsFrom(document.querySelectorAll('[class*="message-bubble"]'), (el) => !!el.closest('[class*="items-end"]')),
      composer: () => document.querySelector("form textarea") || document.querySelector('[contenteditable="true"]'),
      answers: () => [...document.querySelectorAll('[class*="message-bubble"]')].filter((el) => !el.closest('[class*="items-end"]')),
      sendButton: () => document.querySelector('form button[type="submit"], button[aria-label*="Submit" i]'),
      helperUrl: "https://grok.com/",
      newChat: "/",
    },
  ];

  // The fallback for any other chat site. Most chat pages are a scrolling list
  // of turns with a message box at the bottom, so it looks for that shape.
  const GENERIC = {
    id: "generic", name: location.hostname.replace(/^www\./, ""),
    match: () => true,
    turns() {
      // 1. Pages that label their messages (many chat apps do).
      const labeled = document.querySelectorAll("[data-message-author-role], [data-role], [data-author], [data-testid*='message']");
      if (labeled.length >= 2) {
        return turnsFrom(labeled, (el) => /user|human|you|me/i.test(
          el.getAttribute("data-message-author-role") || el.getAttribute("data-role") || el.getAttribute("data-author") || el.getAttribute("data-testid") || ""));
      }
      // 2. Otherwise, the biggest scrolling area's text, as one block.
      let best = null, bestH = 0;
      document.querySelectorAll("main, [role='main'], div, section").forEach((el) => {
        if (el.scrollHeight - el.clientHeight < 40) return;
        const o = getComputedStyle(el).overflowY;
        if ((o === "auto" || o === "scroll") && el.scrollHeight > bestH && visible(el)) { best = el; bestH = el.scrollHeight; }
      });
      const text = textOf(best || document.querySelector("main") || document.body);
      return text ? [{ role: "page", text: text.slice(-60000) }] : [];
    },
    composer() {
      // The lowest visible text box on the page, ignoring the cat's own.
      const boxes = [...document.querySelectorAll("textarea, [contenteditable='true'], input[type='text']")]
        .filter((el) => visible(el) && !el.closest("#cat-ext-host"));
      boxes.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
      return boxes[0] || null;
    },
    newChat: null,
  };

  const site = ADAPTERS.find((a) => a.match(location.hostname)) || GENERIC;
  if (!site.chatKey) site.chatKey = () => location.pathname + location.search;
  if (!site.read) {
    site.read = async () => {
      let messages = [];
      try { messages = site.turns(); } catch (e) {}
      let source = "page";
      if (!messages.length && site !== GENERIC) { messages = GENERIC.turns(); source = "page-text"; }
      return { id: site.chatKey(), title: document.title.replace(/\s*[-|]\s*(ChatGPT|Gemini|Grok|Claude).*$/i, "") || "", messages, source };
    };
  }

  // Puts text into the site's message box (without sending it), so you can
  // read it and press send yourself. Returns false if no box was found.
  function insert(text) {
    const el = site.composer();
    if (!el) return false;
    el.focus();
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      const before = el.value ? el.value.replace(/\s*$/, "") + "\n\n" : "";
      setter.call(el, before + text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    // Rich text boxes (Claude, ChatGPT, Gemini): move to the end and type it in,
    // the way a paste would, so the page's own editor notices.
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges(); sel.addRange(range);
    const prefix = textOf(el) ? "\n\n" : "";
    let ok = false;
    try { ok = document.execCommand("insertText", false, prefix + text); } catch (e) {}
    if (!ok) { el.textContent = (textOf(el) ? textOf(el) + "\n\n" : "") + text; el.dispatchEvent(new Event("input", { bubbles: true })); }
    return true;
  }

  // Text left for the next page to put in its message box: used by /fork and
  // /clone on sites where the cat can't create a chat itself.
  async function leaveForNextPage(text, linkId) {
    await chrome.storage.local.set({ cat_pending: { site: site.id, text, linkId: linkId || null, at: Date.now() } });
  }
  async function takeLeftText() {
    const r = await chrome.storage.local.get("cat_pending");
    const pend = r && r.cat_pending;
    if (!pend || pend.site !== site.id || Date.now() - pend.at > 120000) return null;
    await chrome.storage.local.set({ cat_pending: null });
    return pend;
  }

  // Remember the last text you highlighted, because clicking the cat can clear
  // the selection before we get to read it.
  let lastSelection = { text: "", at: 0 };
  document.addEventListener("selectionchange", () => {
    const sel = document.getSelection();
    const text = sel ? sel.toString().trim() : "";
    if (!text) return;
    const host = document.getElementById("cat-ext-host");
    if (host && sel.anchorNode && host.contains(sel.anchorNode)) return;
    lastSelection = { text, at: Date.now() };
  });
  function getHighlight() {
    const sel = document.getSelection();
    const now = sel ? sel.toString().trim() : "";
    if (now) return now;
    return Date.now() - lastSelection.at < 60000 ? lastSelection.text : "";
  }
  function resetSelection() { lastSelection = { text: "", at: 0 }; }

  CatExt.site = Object.assign(site, { insert, leaveForNextPage, takeLeftText, getHighlight, resetSelection });
})();
