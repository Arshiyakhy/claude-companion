// BRAIN: turns a command into steps, using reader, asker and store.
// No UI code lives here, so a different shell (a desktop cat) could reuse it.
(function () {
  const CatExt = (window.CatExt = window.CatExt || {});
  const MAX_CONTEXT_CHARS = 60000;

  // Pick the message the branch grows from: the last one that contains the
  // highlighted text, or simply the newest message.
  function findAnchor(messages, highlight) {
    if (!messages.length) return null;
    if (highlight) {
      const probe = highlight.slice(0, 80);
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].text.includes(probe)) return messages[i].id;
      }
    }
    return messages[messages.length - 1].id;
  }

  function buildFirstPrompt(session, question) {
    let transcript = session.main.messages
      .map((m) => (m.role === "you" ? "Human" : m.role === "claude" ? "Assistant" : "Page text") + ":\n" + m.text)
      .join("\n\n");
    if (transcript.length > MAX_CONTEXT_CHARS) {
      transcript = "[earlier part left out]\n" + transcript.slice(-MAX_CONTEXT_CHARS);
    }
    const parts = [
      "This is a quick side question about another conversation, shown below. " +
        "Answer only the side question. Keep it short and focused, and do not continue the main task.",
      "<main_conversation>\n" + (transcript || "(empty)") + "\n</main_conversation>",
    ];
    if (session.branch.highlight) {
      parts.push("<highlighted_part>\n" + session.branch.highlight + "\n</highlighted_part>");
    }
    parts.push("Side question: " + question);
    return parts.join("\n\n");
  }

  // branch: read the main chat and the highlight, and create the branch record.
  async function startBranch() {
    const highlight = CatExt.reader.getHighlight();
    const main = await CatExt.reader.getMainChat();
    const branch = {
      id: CatExt.store.uid(),
      mainChatId: main.id,
      anchor: findAnchor(main.messages, highlight),
      highlight,
      messages: [],
      createdAt: new Date().toISOString(),
    };
    return { branch, main, org: null, sideConvId: null, parent: null };
  }

  // Send one question in the side chat. onDelta gets the answer as it grows.
  async function send(session, question, onDelta) {
    if (!session.org) session.org = await CatExt.reader.getOrgId();
    const first = !session.sideConvId;
    if (first) session.sideConvId = await CatExt.asker.createConversation(session.org);

    const prompt = first ? buildFirstPrompt(session, question) : question;
    const result = await CatExt.asker.ask({
      org: session.org,
      convId: session.sideConvId,
      prompt,
      parent: session.parent,
      onDelta,
    });
    session.parent = result.messageUuid;

    session.branch.messages.push({ role: "you", text: question });
    session.branch.messages.push({ role: "claude", text: result.text });
    await CatExt.store.save(session.branch);
    return result.text;
  }

  // Closing removes the hidden conversation from your Claude history.
  // The side chat itself stays saved in the extension's own store.
  async function close(session) {
    if (session && session.org && session.sideConvId) {
      await CatExt.asker.deleteConversation(session.org, session.sideConvId);
      session.sideConvId = null;
    }
  }

  CatExt.brain = { startBranch, send, close };
})();
