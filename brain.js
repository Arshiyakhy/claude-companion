// BRAIN: what each command does, step by step, using site, ai and store.
// No UI code lives here.
(function () {
  const CatExt = (window.CatExt = window.CatExt || {});
  const MAX_CONTEXT_CHARS = 60000;
  const site = () => CatExt.site;

  // The main chat as one block of text, newest part kept if it is very long.
  function transcriptOf(main) {
    let t = main.messages
      .map((m) => (m.role === "you" ? "Human" : m.role === "ai" ? "Assistant" : "Page text") + ":\n" + m.text)
      .join("\n\n");
    if (t.length > MAX_CONTEXT_CHARS) t = "[earlier part left out]\n" + t.slice(-MAX_CONTEXT_CHARS);
    return t;
  }
  const sideTranscript = (msgs) => msgs.map((m) => (m.role === "you" ? "Me" : "You") + ": " + m.text).join("\n\n");

  function firstPrompt(session, question) {
    const b = session.branch;
    const parts = [
      "This is a quick side question about another conversation, shown below. " +
        "Answer only the side question. Keep it short and focused, and do not continue the main task.",
      "<main_conversation>\n" + (transcriptOf(session.main) || "(empty)") + "\n</main_conversation>",
    ];
    if (b.highlight) parts.push("<highlighted_part>\n" + b.highlight + "\n</highlighted_part>");
    // A branch of a side chat starts from that side chat's earlier part.
    if (b.inherited && b.inherited.length) parts.push("<earlier_side_chat>\n" + sideTranscript(b.inherited) + "\n</earlier_side_chat>");
    // A side chat reopened from /tree: catch the new session up on it.
    if (b.messages.length) parts.push("<side_chat_so_far>\n" + sideTranscript(b.messages) + "\n</side_chat_so_far>");
    parts.push("Side question: " + question);
    return parts.join("\n\n");
  }

  // The main chat message a side chat grows from: the last one that contains
  // the highlighted text, or the newest message.
  function anchorOf(messages, highlight) {
    let i = messages.length - 1;
    if (highlight) {
      const probe = highlight.replace(/\s+/g, " ").slice(0, 60);
      for (let j = messages.length - 1; j >= 0; j--) if (messages[j].text.replace(/\s+/g, " ").includes(probe)) { i = j; break; }
    }
    return i < 0 ? { anchorIndex: 0, anchorSnippet: "" } : { anchorIndex: i, anchorSnippet: messages[i].text.replace(/\s+/g, " ").slice(0, 80) };
  }

  // ---------- branch ----------
  // startBranch()            a new side chat off the main chat
  // startBranch(old)         reopen a saved side chat (from /tree)
  // startBranch(null, from)  a branch of a side chat: from = { branch, upTo },
  //                          it keeps that side chat's first upTo messages
  async function startBranch(old, from) {
    const main = await site().read();
    if (old) return { branch: old, main, ai: null };
    const highlight = from ? from.branch.highlight : site().getHighlight();
    const anchor = from ? { anchorIndex: from.branch.anchorIndex, anchorSnippet: from.branch.anchorSnippet } : anchorOf(main.messages, highlight);
    const branch = Object.assign({
      id: CatExt.store.uid(),
      site: site().id,
      chatKey: site().chatKey(),
      chatTitle: main.title || "",
      highlight,
      parentId: from ? from.branch.id : null,
      inherited: from ? from.branch.messages.slice(0, from.upTo) : [],
      messages: [],
      createdAt: new Date().toISOString(),
    }, anchor);
    return { branch, main, ai: null };
  }

  async function send(session, question, onDelta) {
    const first = !session.ai;
    if (first) session.ai = await CatExt.ai.session();
    const text = await session.ai.send(first ? firstPrompt(session, question) : question, onDelta);
    session.branch.messages.push({ role: "you", text: question }, { role: "ai", text });
    session.branch.updatedAt = new Date().toISOString();
    await CatExt.store.save(session.branch);
    return text;
  }

  // Closing ends the hidden chat (on Claude it is deleted from your history).
  // The side chat itself stays saved in the extension, so /log can reopen it.
  function close(session) {
    if (session && session.ai) { session.ai.end(); session.ai = null; }
  }

  // ---------- tree: everything that grew out of this chat ----------
  // The main chat's messages, its side chats (and their branches), the chat
  // it was forked or cloned from, and the chats forked from it.
  async function tree() {
    const main = await site().read();
    const key = site().chatKey(), id = site().id;
    const branches = (await CatExt.store.all())
      .filter((b) => (b.site || "claude") === id && (b.chatKey || b.mainChatId) === key && b.messages && b.messages.length)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const links = await CatExt.store.links();
    const here = (l) => l.toSite === id && l.toKey === key;
    return {
      main, branches,
      parentLink: links.find(here) || null,
      childLinks: links.filter((l) => l.fromSite === id && l.fromKey === key),
    };
  }

  async function markMerged(branch) {
    branch.mergedAt = new Date().toISOString();
    await CatExt.store.save(branch);
  }

  // ---------- merge: bring a side chat back into the main chat ----------
  // Writes a short note for the main chat; the shell puts it in the message box.
  function mergeNote(branch, onDelta) {
    const prompt = [
      "Below is a side chat I had about my main conversation. Write a short note I can paste into the main conversation " +
        "so the assistant there knows what I worked out. Write it in first person, as me. Start with \"From a side chat:\". " +
        "Only the useful conclusions, decisions or corrections, in under 100 words. No greeting, no sign-off.",
      branch.highlight ? "<highlighted_part>\n" + branch.highlight + "\n</highlighted_part>" : "",
      "<side_chat>\n" + sideTranscript(branch.messages) + "\n</side_chat>",
    ].filter(Boolean).join("\n\n");
    return CatExt.ai.once(prompt, onDelta).then((t) => t.trim());
  }

  // ---------- share: the memory pack ----------
  const PACK_START = "===== CAT MEMORY PACK v1 =====";
  const PACK_END = "===== END OF PACK =====";

  function packPrompt(main) {
    return [
      "Write a memory pack from the conversation below. A memory pack is a handoff note: it lets someone else's AI " +
        "assistant pick up this project and keep working without reading the conversation.",
      "Write it in Markdown with exactly these sections:\n" +
        "## Project (what it is and why, 1 to 3 sentences)\n" +
        "## Where things stand\n" +
        "## Decisions made (each with the reason)\n" +
        "## Key details (names, files, commands, numbers, and short code only where it matters)\n" +
        "## Open questions\n" +
        "## Next steps",
      "Only include what the conversation supports. Be specific. No introduction or sign-off. Keep it under 600 words. " +
        "Leave out passwords, API keys, tokens and private contact details; write [removed] in their place.",
      "<conversation>\n" + (transcriptOf(main) || "(empty)") + "\n</conversation>",
    ].join("\n\n");
  }

  async function makePack(onDelta) {
    const main = await site().read();
    if (!main.messages.length) throw new Error("There is no chat open to share.");
    const body = (await CatExt.ai.once(packPrompt(main), onDelta)).trim();
    return { body, title: main.title || "a project chat" };
  }

  function wrapPack(title, body) {
    const date = new Date().toISOString().slice(0, 10);
    return [PACK_START, "From: " + title, "Shared: " + date, "", body.trim(), PACK_END].join("\n");
  }

  function readPack(text) {
    let t = text.trim();
    const a = t.indexOf(PACK_START), b = t.indexOf(PACK_END);
    if (a >= 0) t = t.slice(a + PACK_START.length, b > a ? b : undefined).trim();
    const m = t.match(/^From:\s*(.+)$/m);
    return { title: m ? m[1].trim() : "a teammate's chat", body: t };
  }

  const SECRET_PATTERNS = [
    [/sk-[A-Za-z0-9_-]{16,}/, "an API key"],
    [/AIza[0-9A-Za-z_-]{30,}/, "a Google API key"],
    [/(ghp|gho|github_pat)_[A-Za-z0-9_]{20,}/, "a GitHub token"],
    [/AKIA[0-9A-Z]{16}/, "an AWS key"],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
    [/\b(api[_ -]?key|secret|password|passwd|token)\b\s*[:=]\s*\S{6,}/i, "a password or key"],
    [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, "a login token"],
  ];
  function findSecrets(text) {
    const hits = [];
    text.split("\n").forEach((line, i) => {
      for (const [re, what] of SECRET_PATTERNS) if (re.test(line)) { hits.push({ line: i + 1, what }); break; }
    });
    return hits;
  }

  // ---------- clone and fork: start a new chat that already knows the story ----------
  // On Claude the cat creates the chat itself and opens it. On other sites it
  // opens a new chat and puts the message in the box for you to send.
  // Returns the address to go to.
  // Returns the address to go to, and records the link for the tree.
  async function startChatWith(name, message, link) {
    link = Object.assign({ id: CatExt.store.uid(), toSite: site().id, toKey: null, toHref: null, at: new Date().toISOString() }, link);
    if (site().account) {
      const id = await CatExt.ai.accountSession().newKeptChat(name, message);
      link.toKey = id;
      link.toHref = location.origin + "/chat/" + id;
      await CatExt.store.saveLink(link);
      return "/chat/" + id;
    }
    // Other sites: the new chat only gets its address once you press send
    // there, so the new page finishes the link (see shell.js).
    await CatExt.store.saveLink(link);
    await site().leaveForNextPage(message, link.id);
    return site().newChat || location.pathname;
  }

  // The new page calls this once its chat has an address.
  async function finishLink(linkId) {
    const link = (await CatExt.store.links()).find((l) => l.id === linkId);
    if (!link) return;
    link.toKey = site().chatKey();
    link.toHref = location.href;
    await CatExt.store.saveLink(link);
  }

  async function clonePack(text) {
    const pack = readPack(text);
    if (pack.body.length < 40) throw new Error("That doesn't look like a memory pack. Paste the whole thing your teammate sent.");
    const message =
      "My teammate shared this memory pack from their AI chat about our project. Read it, then reply with a short " +
      "summary of where things stand and ask what I'd like to work on next.\n\n" + text.trim();
    return startChatWith("From teammate: " + pack.title.slice(0, 60), message,
      { kind: "clone", title: pack.title, fromSite: null, fromKey: null, fromHref: null });
  }

  async function forkWith(packText) {
    const message =
      "This is a memory pack from my previous chat about this project. Read it, then reply with a short summary " +
      "of where things stand and the next step, so we can keep going from here.\n\n" + packText.trim();
    const title = readPack(packText).title;
    return startChatWith("Fork: " + title.slice(0, 60), message,
      { kind: "fork", title, fromSite: site().id, fromKey: site().chatKey(), fromHref: location.href });
  }

  CatExt.brain = { startBranch, send, close, tree, markMerged, finishLink, mergeNote, makePack, wrapPack, readPack, findSecrets, clonePack, forkWith };
})();
