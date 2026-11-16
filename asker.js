// ASKER: takes a prompt and returns Claude's answer as it streams.
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

  async function createConversation(org) {
    const uuid = CatExt.store.uid();
    const res = await fetch("/api/organizations/" + org + "/chat_conversations", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uuid, name: "" }),
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

  CatExt.asker = { createConversation, deleteConversation, ask };
})();
