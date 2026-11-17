// CLAUDE (reading): returns the main chat on claude.ai as a list of messages.
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
          role: m.sender === "human" ? "you" : "ai",
          text: messageText(m),
        }))
        .filter((m) => m.text);
      return { id, title: data.name || "", messages, source: "api" };
    } catch (err) {
      return { id, title: document.title || "", messages: readFromPage(), source: "page", error: String(err.message || err) };
    }
  }

  CatExt.claude = Object.assign(CatExt.claude || {}, { getOrgId, conversationId, getMainChat });
})();

// CLAUDE (asking): takes a prompt and returns Claude's answer as it streams.
// Free route: it starts a hidden conversation in your own account, sends the
// prompt there, and reads the reply. Like reader.js, the web addresses here
// are NOT official, so this is the file most likely to need fixing.
(function () {
  const CatExt = (window.CatExt = window.CatExt || {});

  async function fail(res, what) {
    let body = "";
    try {
      body = (await res.text()).slice(0, 200);
    } catch (e) {}
    throw new Error(what + " failed (status " + res.status + ") " + body);
  }

  // name: shown in the sidebar if the chat is kept ("" for hidden side chats).
  async function createConversation(org, name) {
    const uuid = CatExt.store.uid();
    const res = await fetch("/api/organizations/" + org + "/chat_conversations", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uuid, name: name || "" }),
    });
    if (!res.ok) await fail(res, "Starting the side chat");
    return uuid;
  }

  async function deleteConversation(org, convId) {
    try {
      await fetch("/api/organizations/" + org + "/chat_conversations/" + convId, {
        method: "DELETE",
        credentials: "include",
        keepalive: true, // lets the delete finish even if the tab is closing
      });
    } catch (e) {}
  }

  // Sends one message and calls onDelta(textSoFar) as the answer arrives.
  // The reply comes as a stream of lines that start with "data:" and hold
  // small pieces of JSON, one piece of the answer at a time.
  async function ask({ org, convId, prompt, parent, onDelta }) {
    const body = {
      prompt,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      attachments: [],
      files: [],
      sync_sources: [],
      rendering_mode: "messages",
    };
    if (parent) body.parent_message_uuid = parent;

    const res = await fetch(
      "/api/organizations/" + org + "/chat_conversations/" + convId + "/completion",
      {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok || !res.body) await fail(res, "Asking Claude");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let messageUuid = null;

    function handle(line) {
      if (!line.startsWith("data:")) return;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") return;
      let ev;
      try {
        ev = JSON.parse(raw);
      } catch (e) {
        return;
      }
      if (ev.type === "error" || ev.error) {
        const msg = (ev.error && (ev.error.message || ev.error.type)) || "unknown error";
        throw new Error("Claude returned an error: " + msg);
      }
      if (ev.type === "message_start" && ev.message) {
        messageUuid = ev.message.uuid || ev.message.id || messageUuid;
      }
      if (ev.type === "content_block_delta" && ev.delta && typeof ev.delta.text === "string") {
        text += ev.delta.text;
        onDelta && onDelta(text);
      } else if (typeof ev.completion === "string") {
        // Older stream shape.
        text += ev.completion;
        onDelta && onDelta(text);
      }
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) handle(line.trim());
    }
    if (buffer.trim()) handle(buffer.trim());

    if (!text) throw new Error("Claude answered, but no text could be read from the reply");
    return { text, messageUuid };
  }

  CatExt.claude = Object.assign(CatExt.claude || {}, { createConversation, deleteConversation, ask });
})();
