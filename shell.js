// SHELL: everything you see. The cat (drawn by cat-roll.js), the chat bar its
// yarn ball unrolls into, the / command menu, and the side chat panel.
// It all lives inside a Shadow DOM, a sealed box whose styles cannot leak into
// the Claude page and cannot be broken by it.
//
//   hover the cat  -> it swats its ball, the ball rolls left and unwinds into the bar
//   type /         -> the command menu pops up above the bar
//   branch (or just type a question) -> the side chat panel opens above the bar
//   X or Escape    -> the bar winds back up into the ball, home to the cat
(function () {
  const CatExt = (window.CatExt = window.CatExt || {});
  if (document.getElementById("cat-ext-host")) return;

  const ICONS = {
    branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10M18 10c0 4-6 3-11.2 7.4"/>',
    merge: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M6 7v10M6.8 6.7C9 12 12 17 16 18.6"/>',
    share: '<path d="M12 3v12M7.5 7.5L12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
    clone: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  };
  const COMMANDS = [
    { name: "branch", hint: "Ask a side question about this chat", enabled: true },
    { name: "merge", hint: "Bring a side chat back into this chat", enabled: false },
    { name: "share", hint: "Send your side chats to a friend", enabled: false },
    { name: "clone", hint: "Open side chats a friend shared", enabled: false },
  ];
  const R = CatExt.roll;
  const BAR_H = R.BAR_H, CAT_W = R.CAT_W;
  const SIZE = { w: 440 + CAT_W, h: 340 }; // the width is set by layout() below

  // ---------- host and styles ----------
  const host = document.createElement("div");
  host.id = "cat-ext-host";
  host.style.cssText = `position:fixed;right:16px;bottom:16px;width:${SIZE.w}px;height:${SIZE.h}px;z-index:2147483647;pointer-events:none;`;
  const root = host.attachShadow({ mode: "open" });

  root.innerHTML = `
<style>
:host{all:initial}
*{box-sizing:border-box}
.wrap{position:relative;width:100%;height:100%;color:var(--c-ink);font-family:var(--c-font);font-size:14px;line-height:1.5}
svg.anim{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:2}
.cathit{position:absolute;right:0;bottom:0;width:${CAT_W + 50}px;height:96px;border:0;padding:0;background:transparent;border-radius:30px;cursor:pointer;pointer-events:auto;z-index:3}
button{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--c-ink);outline-offset:2px}

/* everything that opens sits in one column anchored to the bottom right */
.composer{position:absolute;right:${CAT_W}px;bottom:0;width:var(--bar-w,440px);display:none;flex-direction:column;gap:8px;align-items:stretch;z-index:1}
.wrap.open .composer{display:flex}
.wrap.open .composer{pointer-events:auto}

/* the bar, shaped like Claude's input */
.barwrap{filter:drop-shadow(0 8px 20px var(--c-shadow))}
.bar{position:relative;display:flex;align-items:flex-end;gap:6px;min-height:${BAR_H}px;padding:5px 6px;border-radius:28px;background:var(--c-bg);border:1px solid var(--c-border-strong)}
.ballbtn,.send{width:44px;height:44px;flex:none;border:0;border-radius:22px;display:flex;align-items:center;justify-content:center;cursor:pointer}
.ballbtn{background:transparent;color:var(--c-ink);border:1.5px solid var(--c-border-strong);font-size:18px;font-weight:600;line-height:1;opacity:var(--slash-o,1);transform:scale(var(--slash-s,1))}
.ballbtn:hover,.ballbtn[aria-expanded="true"]{background:var(--c-soft)}
.closex{opacity:var(--done,1)}
.send{background:var(--c-ink);color:var(--c-bg)}
.send:disabled{opacity:.35;cursor:default}
.in{flex:1;min-width:0;height:44px;max-height:150px;resize:none;border:0;background:transparent;color:var(--c-ink);font:inherit;font-size:15px;line-height:22px;padding:11px 4px;overflow-y:auto}
.in:focus{outline:none}
.in::placeholder{color:var(--c-muted)}
.closex{position:absolute;top:-12px;left:-8px;width:28px;height:28px;border-radius:14px;border:1px solid var(--c-border-strong);background:var(--c-bg);color:var(--c-ink);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;box-shadow:0 2px 8px var(--c-shadow)}
.closex::before{content:"";position:absolute;inset:-8px}
.closex:hover{background:var(--c-soft)}

/* the / menu */
.menu{position:absolute;left:8px;bottom:calc(100% + 8px);width:300px;max-width:calc(100% - 16px);padding:6px;border-radius:16px;background:var(--c-bg);border:1px solid var(--c-border-strong);box-shadow:0 12px 32px var(--c-shadow);display:none;flex-direction:column;gap:2px}
.menu.show{display:flex}
.item{display:flex;align-items:center;gap:12px;min-height:44px;padding:6px 10px;border:0;border-radius:10px;background:transparent;text-align:left;cursor:pointer;width:100%}
.item svg{width:20px;height:20px;flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.item .t{display:flex;flex-direction:column;min-width:0;flex:1}
.item .n{font-weight:600;font-size:14px}
.item .h{font-size:12px;color:var(--c-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.item .soon{font-size:11px;color:var(--c-muted);border:1px solid var(--c-border);border-radius:8px;padding:1px 6px}
.item.on{background:var(--c-soft)}
.item[aria-disabled="true"]{cursor:default}
.item[aria-disabled="true"] .n,.item[aria-disabled="true"] svg{opacity:.5}
.menu .empty{padding:10px;font-size:13px;color:var(--c-muted)}

/* the side chat panel, above the bar */
.panel{display:none;flex-direction:column;max-height:var(--panel-h,460px);border-radius:20px;background:var(--c-bg);border:1px solid var(--c-border-strong);box-shadow:0 12px 32px var(--c-shadow);overflow:hidden;
  transform-origin:50% 100%;animation:rise .28s cubic-bezier(.2,.8,.2,1)}
.panel.show{display:flex}
@keyframes rise{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}
.head{display:flex;align-items:center;gap:10px;padding:8px 8px 8px 14px;border-bottom:1px solid var(--c-border);flex:none}
.head .chip{display:flex;align-items:center;gap:6px;font-weight:650}
.head .chip svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.head .sub{flex:1;min-width:0;font-size:12px;color:var(--c-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.endbtn{min-height:36px;padding:0 12px;border-radius:18px;border:1px solid var(--c-border-strong);background:transparent;cursor:pointer;font-size:13px}
.endbtn:hover{background:var(--c-soft)}
.body{overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:12px}
.quote{border-left:3px solid var(--c-border-strong);background:var(--c-mark);border-radius:6px;padding:6px 10px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;white-space:pre-wrap;max-height:110px;overflow:auto}
.label{font-size:12px;color:var(--c-muted);margin-bottom:-6px}
.note{font-size:12px;color:var(--c-muted)}
.you{align-self:flex-end;max-width:85%;background:var(--c-soft);border-radius:16px;padding:8px 12px;white-space:pre-wrap;overflow-wrap:anywhere}
.ans{overflow-wrap:anywhere}
.ans > :first-child{margin-top:0}.ans > :last-child{margin-bottom:0}
.ans p,.ans ul,.ans ol,.ans h4,.ans .code{margin:0 0 10px}
.ans ul,.ans ol{padding-left:20px}
.ans li{margin:2px 0}
.ans h4{font-size:14px;font-weight:650}
.ans a{color:inherit;text-decoration:underline}
.ans code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;background:var(--c-code);border:1px solid var(--c-border);border-radius:5px;padding:0 4px}
.ans .code{background:var(--c-code);border:1px solid var(--c-border);border-radius:10px;overflow:hidden}
.ans .code .lang{font-size:11px;color:var(--c-muted);padding:6px 10px 0}
.ans pre{margin:0;padding:8px 10px 10px;overflow-x:auto}
.ans pre code{background:none;border:0;padding:0;line-height:1.55}
.err{color:var(--c-err)}
.dots{display:inline-flex;gap:4px;padding:6px 0}
.dots i{width:6px;height:6px;border-radius:3px;background:var(--c-muted);animation:b 1s infinite ease-in-out}
.dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}
@keyframes b{0%,80%,100%{opacity:.25}40%{opacity:1}}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
</style>
<div class="wrap">
  <svg class="anim" viewBox="0 0 ${SIZE.w} ${SIZE.h}" aria-hidden="true"></svg>
  <button type="button" class="cathit" aria-label="Cat helper, open the side chat bar"></button>
  <div class="composer">
    <section class="panel" role="region" aria-label="Side chat">
      <div class="head">
        <span class="chip"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.branch}</svg>branch</span>
        <span class="sub"></span>
        <button type="button" class="endbtn">End</button>
      </div>
      <div class="body" aria-live="polite"></div>
    </section>
    <div class="barwrap"><div class="bar">
      <div class="menu" role="listbox" aria-label="Commands"></div>
      <button type="button" class="ballbtn" aria-label="Commands" aria-haspopup="listbox" aria-expanded="false">/</button>
      <textarea class="in" rows="1" aria-label="Ask a side question, or type / for commands" placeholder="Ask a side question, or type / for commands"></textarea>
      <button type="button" class="send" aria-label="Send" disabled>
        <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button type="button" class="closex" aria-label="Close and go back to the cat">
        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </div></div>
  </div>
  <div class="sr" aria-live="polite"></div>
</div>`;

  const $ = (s) => root.querySelector(s);
  const wrap = $(".wrap"), catHit = $(".cathit"), composer = $(".composer"), bar = $(".bar");
  const menu = $(".menu"), ballBtn = $(".ballbtn"), input = $(".in"), sendBtn = $(".send"), closeX = $(".closex");
  const panel = $(".panel"), body = $(".body"), sub = $(".sub"), endBtn = $(".endbtn"), sr = $(".sr");

  // ---------- size: the bar is as wide as fits, up to 440px, with the cat to its right ----------
  let barW = 440, geom = null;
  const cat = R.build($("svg.anim"));
  function layout() {
    barW = Math.max(280, Math.min(440, window.innerWidth - 40 - CAT_W));
    const w = barW + CAT_W;
    host.style.width = w + "px";
    $("svg.anim").setAttribute("viewBox", `0 0 ${w} ${SIZE.h}`);
    wrap.style.setProperty("--bar-w", barW + "px");
    wrap.style.setProperty("--panel-h", Math.max(220, Math.min(460, window.innerHeight - BAR_H - 70)) + "px");
    geom = R.geometry(w, SIZE.h);
  }
  layout();
  window.addEventListener("resize", () => { layout(); paint(); });

  // ---------- theme: follow the person's Claude colors ----------
  CatExt.theme.watch((t) => {
    for (const k in t.vars) wrap.style.setProperty(k, t.vars[k]);
    wrap.style.setProperty("--c-font", t.font);
  });

  // ---------- the cat timeline ----------
  // p goes from 0 (cat with its ball) to 1 (bar open). The loop only runs while p moves.
  let p = 0, goal = 0, last = 0, running = false, openedOnce = false;
  const clamp = (x) => Math.min(1, Math.max(0, x));
  function paint() {
    const st = cat.render(p, geom);
    wrap.classList.toggle("open", p > 0.1 || goal === 1);
    wrap.classList.toggle("live", p > 0.97);
    // The bar is unrolled up to where the ball is. Once fully open, drop the
    // clip so the / menu above the bar can show.
    bar.style.clipPath = st.cut <= 0 ? "none" : `inset(-20px -20px -20px ${st.cut.toFixed(1)}px round 28px)`;
    // With the yarn used up, the / button takes the ball's spot with a small pop.
    const q = clamp((p - 0.9) / 0.1);
    wrap.style.setProperty("--slash-o", Math.min(1, q * 2));
    wrap.style.setProperty("--slash-s", ((0.6 + 0.4 * q) * (1 + 0.12 * Math.sin(Math.PI * q))).toFixed(3));
    wrap.style.setProperty("--done", clamp((p - 0.92) / 0.08));
  }
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // The first open plays the whole show; later ones are quicker; closing is quickest.
    const dur = goal > p ? (openedOnce ? R.DURATION.reopen : R.DURATION.open) : R.DURATION.close;
    p = goal > p ? Math.min(goal, p + dt / dur) : Math.max(goal, p - dt / dur);
    paint();
    if (p === 1) openedOnce = true;
    if (p !== goal) requestAnimationFrame(frame);
    else running = false;
  }
  function go(t) {
    goal = t;
    if (!running && p !== goal) {
      running = true;
      requestAnimationFrame((now) => { last = now; frame(now); });
    }
  }
  paint();

  // ---------- opening and closing ----------
  // The bar stays open while it is in use: focused, holding text, showing the
  // menu, or running a side chat. Otherwise it folds back when the pointer leaves.
  let inside = false, leaveTimer = null, session = null, busy = false;
  const inUse = () => !!session || input.value.trim() !== "" || menu.classList.contains("show") || root.activeElement === input;
  // A short pause before opening, so a mouse just passing over doesn't set it off.
  let openTimer = null;
  function open() { clearTimeout(leaveTimer); clearTimeout(openTimer); openTimer = setTimeout(() => go(1), goal === 1 ? 0 : 120); }
  function maybeClose(delay) {
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => { if (!inside && !inUse()) closeAll(); }, delay);
  }
  catHit.addEventListener("mouseenter", () => { inside = true; open(); });
  catHit.addEventListener("mouseleave", () => { inside = false; clearTimeout(openTimer); maybeClose(700); });
  composer.addEventListener("mouseenter", () => { inside = true; clearTimeout(leaveTimer); });
  composer.addEventListener("mouseleave", () => { inside = false; maybeClose(900); });
  catHit.addEventListener("click", () => {
    clearTimeout(openTimer); go(1);
    setTimeout(() => input.focus(), (openedOnce ? R.DURATION.reopen : R.DURATION.open) * 1000 * (1 - p));
  });
  input.addEventListener("blur", () => maybeClose(900));
  // Keep the page's highlighted text alive when the cat or a command is pressed.
  [catHit, ballBtn, menu].forEach((b) => b.addEventListener("mousedown", (e) => e.preventDefault()));

  function closeAll() {
    hideMenu();
    endSession();
    input.value = "";
    autosize();
    input.blur();
    go(0);
  }
  closeX.addEventListener("click", closeAll);

  // ---------- the / menu ----------
  let shown = [], active = 0;
  function showMenu(filter) {
    filter = (filter || "").toLowerCase();
    shown = COMMANDS.filter((c) => c.name.startsWith(filter));
    if (!shown.length) menu.innerHTML = '<div class="empty">No command called /' + filter.replace(/[<>&"]/g, "") + "</div>";
    else {
      menu.innerHTML = shown.map((c, i) => `
        <button type="button" class="item" role="option" data-i="${i}"${c.enabled ? "" : ' aria-disabled="true"'}>
          <svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[c.name]}</svg>
          <span class="t"><span class="n">/${c.name}</span><span class="h">${c.hint}</span></span>
          ${c.enabled ? "" : '<span class="soon">soon</span>'}
        </button>`).join("");
      menu.querySelectorAll(".item").forEach((b) => {
        b.addEventListener("mouseenter", () => setActive(+b.dataset.i));
        b.addEventListener("click", () => pick(+b.dataset.i));
      });
    }
    const firstOn = shown.findIndex((c) => c.enabled);
    setActive(firstOn < 0 ? 0 : firstOn);
    menu.classList.add("show");
    ballBtn.setAttribute("aria-expanded", "true");
  }
  function hideMenu() {
    menu.classList.remove("show");
    ballBtn.setAttribute("aria-expanded", "false");
  }
  function setActive(i) {
    active = i;
    menu.querySelectorAll(".item").forEach((b, j) => {
      b.classList.toggle("on", j === i);
      b.setAttribute("aria-selected", j === i ? "true" : "false");
    });
  }
  function move(step) {
    if (!shown.length) return;
    let i = active;
    for (let n = 0; n < shown.length; n++) {
      i = (i + step + shown.length) % shown.length;
      if (shown[i].enabled) return setActive(i);
    }
  }
  function pick(i) {
    const c = shown[i];
    if (!c) return;
    if (!c.enabled) { sr.textContent = "/" + c.name + " is coming soon."; return; }
    hideMenu();
    input.value = "";
    autosize();
    input.focus();
    if (c.name === "branch") startBranch();
  }
  ballBtn.addEventListener("click", () => {
    if (menu.classList.contains("show")) hideMenu();
    else showMenu("");
    input.focus();
  });

  // ---------- the side chat ----------
  function add(cls, text) {
    const el = document.createElement("div");
    el.className = cls;
    if (text !== undefined) el.textContent = text;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el;
  }

  async function startBranch() {
    if (session) return session;
    panel.classList.add("show");
    body.textContent = "";
    sub.textContent = "Reading the main chat";
    const dots = add("dots");
    dots.innerHTML = "<i></i><i></i><i></i>";
    let s;
    try {
      s = await CatExt.brain.startBranch();
    } catch (err) {
      body.textContent = "";
      sub.textContent = "";
      add("err", "Could not read the main chat: " + (err.message || err));
      return null;
    }
    session = s;
    body.textContent = "";
    const n = s.main.messages.length;
    if (s.main.source === "api") sub.textContent = "knows the main chat, " + n + " messages";
    else if (s.main.source === "page") sub.textContent = "read the main chat from the page";
    else sub.textContent = "no chat open to read";
    if (s.branch.highlight) {
      add("label", "Highlighted in the main chat");
      add("quote", s.branch.highlight);
    }
    if (s.main.source === "page") add("note", "Could not load the chat data (" + s.main.error + "), so this side chat sees the visible page text instead.");
    return s;
  }

  function endSession() {
    const old = session;
    session = null;
    busy = false;
    if (old) CatExt.brain.close(old);
    panel.classList.remove("show");
    body.textContent = "";
    updateSend();
  }
  endBtn.addEventListener("click", () => { endSession(); input.focus(); });

  async function submit() {
    const q = input.value.trim();
    if (!q || busy) return;
    if (q.startsWith("/")) {
      // A typed command, like "/branch" + Enter.
      if (menu.classList.contains("show") && shown.length) pick(active);
      return;
    }
    busy = true;
    updateSend();
    input.value = "";
    autosize();
    const s = session || (await startBranch());
    if (!s) { busy = false; updateSend(); return; }
    add("you", q);
    const out = add("ans");
    out.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
    let pending = "", queued = false;
    const draw = () => { queued = false; out.innerHTML = CatExt.markdown.render(pending); body.scrollTop = body.scrollHeight; };
    try {
      await CatExt.brain.send(s, q, (text) => {
        pending = text;
        if (!queued) { queued = true; requestAnimationFrame(draw); }
      });
    } catch (err) {
      out.className = "err";
      out.textContent = String(err.message || err);
    }
    busy = false;
    updateSend();
    input.focus();
  }

  // ---------- typing ----------
  function autosize() {
    input.style.height = "44px";
    input.style.height = Math.min(input.scrollHeight, 150) + "px";
  }
  function updateSend() {
    const v = input.value.trim();
    sendBtn.disabled = busy || !v || (v.startsWith("/") && !menu.classList.contains("show"));
  }
  input.addEventListener("input", () => {
    autosize();
    const m = input.value.match(/^\/(\w*)$/);
    if (m) showMenu(m[1]);
    else hideMenu();
    updateSend();
  });
  // Enter sends. Tab+Enter (hold Tab, press Enter) or Shift+Enter makes a new line.
  // While the / menu is open, the arrow keys move and Enter or Tab picks.
  let tabHeld = false;
  input.addEventListener("keydown", (e) => {
    const menuOpen = menu.classList.contains("show");
    if (menuOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); move(e.key === "ArrowDown" ? 1 : -1); return; }
    if (e.key === "Escape") {
      e.preventDefault();
      if (menuOpen) hideMenu();
      else closeAll();
      return;
    }
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      if (menuOpen) { pick(active); return; }
      tabHeld = true;
      return;
    }
    if (e.key === "Enter" && !e.isComposing) {
      if (menuOpen) { e.preventDefault(); pick(active); return; }
      if (e.shiftKey || tabHeld) return;
      e.preventDefault();
      submit();
    }
  });
  input.addEventListener("keyup", (e) => { if (e.key === "Tab") tabHeld = false; });
  input.addEventListener("blur", () => { tabHeld = false; });
  sendBtn.addEventListener("click", submit);
  // Stop the Claude page from reacting to keys typed inside the bar.
  ["keydown", "keyup", "keypress"].forEach((type) => host.addEventListener(type, (e) => e.stopPropagation()));
  // A click anywhere outside the menu closes it.
  root.addEventListener("mousedown", (e) => {
    if (menu.classList.contains("show") && !menu.contains(e.target) && e.target !== ballBtn && !ballBtn.contains(e.target) && e.target !== input) hideMenu();
  });

  // ---------- switching chats ----------
  // claude.ai changes chats without reloading the page, so we watch the address.
  // A side chat belongs to the chat it was opened from, so it ends (and its
  // hidden conversation is deleted) when you move to another chat.
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    CatExt.reader.resetSelection();
    if (session) endSession();
  }, 500);
  window.addEventListener("pagehide", () => { if (session) CatExt.brain.close(session); });

  // ---------- the cat stays alive: blinking, and watching your mouse ----------
  R.startBlinking((v) => cat.blink(v));
  let mouse = null, lookQueued = false;
  document.addEventListener("mousemove", (e) => {
    const r = host.getBoundingClientRect();
    mouse = [e.clientX - r.left, e.clientY - r.top];
    if (!lookQueued) { lookQueued = true; requestAnimationFrame(() => { lookQueued = false; cat.look(mouse); }); }
  }, { passive: true });
  document.addEventListener("mouseleave", () => cat.look(null));

  document.documentElement.appendChild(host);
})();
