// READER: returns the main chat as a list of messages, plus the highlighted text.
// It asks claude.ai for the same conversation data the page itself loads.
// These web addresses are NOT official or documented. If Anthropic changes
// them, this file is the one to fix.
(function () {
  const CatExt = (window.CatExt = window.CatExt || {});
  let cachedOrg = null;

  // Your account's organization id. The page keeps it in a cookie.
  async function getOrgId() {
    if (cachedOrg) return cachedOrg;
    const m = document.cookie.match(/(?:^|;\s*)lastActiveOrg=([^;]+)/);
    if (m) {
      cachedOrg = decodeURIComponent(m[1]);
      return cachedOrg;
    }
    const res = await fetch("/api/organizations", { credentials: "include" });
    if (!res.ok) throw new Error("Could not find your account (status " + res.status + ")");
    const orgs = await res.json();
    if (!orgs.length) throw new Error("No organization found on this account");
    cachedOrg = orgs[0].uuid;
    return cachedOrg;
  }

  // The id of the chat you are looking at, taken from the address bar.
  function conversationId() {
    const m = location.pathname.match(/\/chat\/([0-9a-f-]{36})/i);
    return m ? m[1] : null;
  }

  function messageText(m) {
    if (Array.isArray(m.content)) {
      const parts = m.content.filter((c) => c.type === "text" && c.text).map((c) => c.text);
      if (parts.length) return parts.join("\n");
    }
    return m.text || "";
  }

  // A chat is stored as a tree (edits and retries make forks). We walk from
  // the newest message up through its parents to get the path you see.
  function visiblePath(data) {
    const msgs = data.chat_messages || [];
    const byId = new Map(msgs.map((m) => [m.uuid, m]));
    let leaf = data.current_leaf_message_uuid;
    if (!leaf || !byId.has(leaf)) {
      return msgs.slice().sort((a, b) => (a.index || 0) - (b.index || 0));
    }
    const path = [];
    while (leaf && byId.has(leaf)) {
      const m = byId.get(leaf);
      path.unshift(m);
      leaf = m.parent_message_uuid;
    }
    return path;
  }

  // Fallback if the data request fails: read the visible text of the page.
  function readFromPage() {
    const main = document.querySelector("main") || document.body;
    const text = (main.innerText || "").trim();
    return text ? [{ id: null, role: "page", text }] : [];
  }

  async function getMainChat() {
    const id = conversationId();
    if (!id) return { id: null, messages: [], source: "none" };
    try {
      const org = await getOrgId();
      const res = await fetch(
        "/api/organizations/" + org + "/chat_conversations/" + id + "?tree=True&rendering_mode=messages&render_all_tools=true",
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("status " + res.status);
      const data = await res.json();
      const messages = visiblePath(data)
        .map((m) => ({
          id: m.uuid,
          role: m.sender === "human" ? "you" : "claude",
          text: messageText(m),
        }))
        .filter((m) => m.text);
      return { id, messages, source: "api" };
    } catch (err) {
      return { id, messages: readFromPage(), source: "page", error: String(err.message || err) };
    }
  }

  // Remember the last text you highlighted on the page, because clicking the
  // cat can clear the selection before we get to read it.
  let lastSelection = { text: "", at: 0 };
  document.addEventListener("selectionchange", () => {
    const sel = document.getSelection();
    const text = sel ? sel.toString().trim() : "";
    if (!text) return;
    const node = sel.anchorNode;
    const host = document.getElementById("cat-ext-host");
    if (host && node && host.contains(node)) return;
    lastSelection = { text, at: Date.now() };
  });

  function getHighlight() {
    const sel = document.getSelection();
    const now = sel ? sel.toString().trim() : "";
    if (now) return now;
    // Accept a selection made in the last 60 seconds.
    if (Date.now() - lastSelection.at < 60000) return lastSelection.text;
    return "";
  }

  // Forget the remembered highlight, for example after switching chats.
  function resetSelection() {
    lastSelection = { text: "", at: 0 };
  }

  CatExt.reader = { getOrgId, conversationId, getMainChat, getHighlight, resetSelection };
})();
