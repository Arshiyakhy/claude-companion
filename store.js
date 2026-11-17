// STORE: remembers side chats (branches) and where they branched from.
// Uses chrome.storage.local, a small key/value database every extension gets.
(function () {
  const CatExt = (window.CatExt = window.CatExt || {});
  const KEY = "cat_branches";

  async function all() {
    const result = await chrome.storage.local.get(KEY);
    return result[KEY] || [];
  }

  // Insert the branch, or replace it if one with the same id already exists.
  async function save(branch) {
    const list = await all();
    const i = list.findIndex((b) => b.id === branch.id);
    if (i >= 0) list[i] = branch;
    else list.push(branch);
    await chrome.storage.local.set({ [KEY]: list });
  }

  // A random id. crypto.randomUUID exists on https pages like claude.ai,
  // the fallback covers anywhere it does not.
  function uid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }

  // Links between chats: made by /fork (this chat -> a fresh one) and /clone
  // (a teammate's pack -> a new chat). The tree uses them to connect chats.
  const LINKS = "cat_links";
  async function links() { const r = await chrome.storage.local.get(LINKS); return r[LINKS] || []; }
  async function saveLink(link) {
    const list = await links();
    const i = list.findIndex((l) => l.id === link.id);
    if (i >= 0) list[i] = link; else list.push(link);
    await chrome.storage.local.set({ [LINKS]: list });
  }

  CatExt.store = { all, save, uid, links, saveLink };
})();
