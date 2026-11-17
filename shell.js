// SHELL: everything you see. The pixel cat (drawn by cat-roll.js), the chat
// bar its yarn ball unrolls into, the / command menu, and the side panel.
// It all lives inside a Shadow DOM, a sealed box whose styles cannot leak into
// the chat site and cannot be broken by it.
//
//   click the cat        -> it swats its ball, which rolls and unwinds into the bar
//   click it again       -> the bar winds back up into the ball (so do X and Escape)
//   double-tap the cat   -> pick it up (bar open or closed); it follows your
//                           pointer, tap to drop it (Escape puts it back),
//                           or press and hold to drag it
//   type /               -> the command menu
(function () {
  const CatExt = (window.CatExt = window.CatExt || {});
  if (document.getElementById("cat-ext-host")) return;

  const ICONS = {
    branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10M18 10c0 4-6 3-11.2 7.4"/>',
    merge: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M6 7v10M6.8 6.7C9 12 12 17 16 18.6"/>',
    tree: '<circle cx="6" cy="4" r="2"/><circle cx="6" cy="20" r="2"/><circle cx="18" cy="9" r="2"/><circle cx="18" cy="16" r="2"/><path d="M6 6v12M6 9h4c3 0 3 0 6 0M6 13c4 0 4 3 10 3"/>',
    fork: '<circle cx="12" cy="19" r="2"/><circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 7v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7M12 12v5"/>',
    share: '<path d="M12 3v12M7.5 7.5L12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
    clone: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2"/>',
  };
  const COMMANDS = [
    { name: "branch", hint: "Ask a side question about this chat" },
    { name: "merge", hint: "Bring what you learned back into the main chat" },
    { name: "tree", hint: "Everything that grew out of this chat" },
    { name: "fork", hint: "Fresh chat that keeps this chat's memory" },
    { name: "share", hint: "Make a memory pack of this chat for a teammate" },
    { name: "clone", hint: "Start a chat from a teammate's memory pack" },
    { name: "key", hint: "Free Gemini key, used on sites other than Claude" },
  ];
  const R = CatExt.roll, site = CatExt.site;
  const BAR_H = R.BAR_H;
  let CAT_W = 60, CAT_R = 30; // set by fitToMonitor() below
  const SIZE = { h: 342 }; // a multiple of 3, so the pixel cat stays crisp

  // ---------- host and styles ----------
  const host = document.createElement("div");
  host.id = "cat-ext-host";
  host.style.cssText = `position:fixed;left:0;top:0;width:500px;height:${SIZE.h}px;z-index:2147483647;pointer-events:none;`;
  const root = host.attachShadow({ mode: "open" });

  root.innerHTML = `
<style>
:host{all:initial}
*{box-sizing:border-box}
.wrap{position:relative;width:100%;height:100%;color:var(--c-ink);font-family:var(--c-font);font-size:14px;line-height:1.5}
canvas.anim{position:absolute;left:0;top:0;pointer-events:none;z-index:2;image-rendering:pixelated}
.cathit{position:absolute;right:0;bottom:0;width:var(--hit-w,90px);height:var(--hit-h,76px);border:0;padding:0;background:transparent;border-radius:30px;cursor:pointer;pointer-events:auto;z-index:3;touch-action:none}
.wrap.dragging .cathit,.wrap.carrying .cathit{cursor:grabbing}
/* cat on the left side of the screen: everything flips, the ball rolls right */
.wrap.mirror canvas.anim{transform:scaleX(-1)}
.wrap.mirror .cathit{right:auto;left:0}
.wrap.mirror .composer{right:auto;left:var(--cat-w,60px)}
.wrap.mirror .bar{flex-direction:row-reverse}
.wrap.mirror .closex{left:auto;right:-8px}
.wrap.mirror .menu{left:auto;right:8px}
/* cat near the top of the screen: the panel and menu open below the bar */
.wrap.below .composer{bottom:auto;top:calc(100% - ${BAR_H}px);flex-direction:column-reverse}
.wrap.below .menu{bottom:auto;top:calc(100% + 8px)}
button{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--c-ink);outline-offset:2px}

/* everything that opens sits in one column anchored to the bottom right */
.composer{position:absolute;right:var(--cat-w,60px);bottom:0;width:var(--bar-w,440px);display:none;flex-direction:column;gap:8px;align-items:stretch;z-index:1}
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
.pack{width:100%;min-height:220px;max-height:300px;resize:vertical;border:1px solid var(--c-border-strong);border-radius:12px;padding:10px 12px;background:var(--c-code);color:var(--c-ink);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.5}
.pack:focus-visible{outline:2px solid var(--c-ink);outline-offset:1px}
.warn{border:1px solid var(--c-err);border-radius:10px;padding:8px 10px;font-size:12.5px;color:var(--c-ink)}
.warn b{color:var(--c-err)}
.warn ul{margin:4px 0 0;padding-left:18px}
.actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.primary{min-height:44px;padding:0 18px;border-radius:22px;border:0;background:var(--c-ink);color:var(--c-bg);font-weight:600;cursor:pointer}
.primary:disabled{opacity:.4;cursor:default}
.dots{display:inline-flex;gap:4px;padding:6px 0}
.dots i{width:6px;height:6px;border-radius:3px;background:var(--c-muted);animation:b 1s infinite ease-in-out}
.dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}
@keyframes b{0%,80%,100%{opacity:.25}40%{opacity:1}}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.tree{position:relative}
.tree svg.lines{position:absolute;left:0;top:0;pointer-events:none;overflow:visible}
.tree svg.lines path{fill:none;stroke-width:2;stroke-linecap:round}
.tree .row{position:absolute;height:28px;display:flex;align-items:center;gap:6px;border:0;background:transparent;padding:0 8px;border-radius:8px;cursor:pointer;text-align:left;font-size:13px;min-width:0}
.tree .row:hover{background:var(--c-soft)}
.tree .row .lbl{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.tree .row.msg .who{color:var(--c-muted);flex:none}
.tree .row.side,.tree .row.link{border:1px solid var(--c-yarn);background:var(--c-bg)}
.tree .row.side:hover,.tree .row.link:hover{background:var(--c-soft)}
.tree .row.link{border-color:#2E8B7A}
.tree .row.gap{cursor:default;color:var(--c-muted);font-size:12px}
.tree .row.gap:hover{background:transparent}
.tree .tag{flex:none;font-size:11px;border-radius:8px;padding:0 6px;border:1px solid var(--c-border-strong);color:var(--c-muted)}
.mini{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:0 10px;margin-top:-4px;border-radius:16px;border:1px solid var(--c-border);background:transparent;cursor:pointer;font-size:12px;color:var(--c-muted)}
.mini:hover{background:var(--c-soft);color:var(--c-ink)}
.mini svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.inh{opacity:.55}
.loglist{display:flex;flex-direction:column;gap:6px}
.logitem{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;min-height:44px;padding:8px 12px;border:1px solid var(--c-border);border-radius:12px;background:transparent;cursor:pointer;width:100%}
.logitem:hover{background:var(--c-soft)}
.logitem .q{font-weight:600;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.logitem .m{font-size:12px;color:var(--c-muted)}
.keyin{width:100%;min-height:44px;border:1px solid var(--c-border-strong);border-radius:12px;padding:0 12px;background:var(--c-code);color:var(--c-ink);font:inherit;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px}
.note a{color:inherit;text-decoration:underline}
.secondary{min-height:44px;padding:0 16px;border-radius:22px;border:1px solid var(--c-border-strong);background:transparent;cursor:pointer}
.secondary:hover{background:var(--c-soft)}
</style>
<div class="wrap">
  <canvas class="anim" aria-hidden="true"></canvas>
  <button type="button" class="cathit" aria-label="Cat helper. Click to open the side chat bar, double-tap to move it"></button>
  <div class="composer">
    <section class="panel" role="region" aria-label="Side chat">
      <div class="head">
        <span class="chip"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.branch}</svg><span class="chipname">branch</span></span>
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
  const wrap = $(".wrap"), catHit = $(".cathit"), bar = $(".bar"), canvas = $("canvas.anim");
  const menu = $(".menu"), ballBtn = $(".ballbtn"), input = $(".in"), sendBtn = $(".send"), closeX = $(".closex");
  const panel = $(".panel"), body = $(".body"), sub = $(".sub"), endBtn = $(".endbtn"), sr = $(".sr");
  const chipIcon = $(".chip svg"), chipName = $(".chipname");
  const errText = (e) => String((e && e.message) || e);

  // ---------- where the cat sits ----------
  // pos is the cat's center, saved as a fraction of the window. The bar unrolls
  // toward the side with more room; the panel opens below the bar near the top.
  let pos = null, mirror = false, below = false, barW = 438, hostW = 498, geom = null;
  // Sizes the cat for the monitor this window is on. Runs again when the
  // window moves to another monitor (its screen size or scaling changes).
  let fitKey = "";
  function fitToMonitor() {
    const key = [screen.width, screen.height, window.devicePixelRatio].join("x");
    if (key === fitKey) return false;
    fitKey = key;
    R.setPx(R.pickPx());
    const z = R.size();
    CAT_W = z.CAT_W; CAT_R = z.CAT_R;
    wrap.style.setProperty("--cat-w", CAT_W + "px");
    wrap.style.setProperty("--hit-w", Math.round(CAT_W + 15 * z.PX) + "px");
    wrap.style.setProperty("--hit-h", Math.round(38 * z.PX) + "px");
    return true;
  }
  fitToMonitor();
  const cat = R.build(canvas, { mode: "pixel" });
  function defaultPos() { return { fx: (window.innerWidth - 16 - CAT_R) / window.innerWidth, fy: (window.innerHeight - 16 - CAT_R) / window.innerHeight }; }
  function layout() {
    pos = pos || defaultPos();
    const W = window.innerWidth, H = window.innerHeight;
    const cx = Math.min(W - CAT_R, Math.max(CAT_R, pos.fx * W));
    const cy = Math.min(H - CAT_R, Math.max(70, pos.fy * H));
    mirror = cx < W / 2;
    const room = mirror ? W - (cx - CAT_R) - CAT_W - 16 : cx + CAT_R - CAT_W - 16;
    barW = Math.floor(Math.max(240, Math.min(440, room)) / 6) * 6;
    hostW = barW + CAT_W;
    const panelRoomAbove = cy - CAT_R - BAR_H - 24, panelRoomBelow = H - cy - 24;
    below = panelRoomAbove < 320 && panelRoomBelow > panelRoomAbove;
    const panelH = Math.max(200, Math.min(460, below ? panelRoomBelow : panelRoomAbove));
    host.style.width = hostW + "px";
    host.style.left = Math.round(mirror ? cx - CAT_R : cx + CAT_R - hostW) + "px";
    host.style.top = Math.round(cy + CAT_R - SIZE.h) + "px";
    wrap.classList.toggle("mirror", mirror);
    wrap.classList.toggle("below", below);
    wrap.style.setProperty("--bar-w", barW + "px");
    wrap.style.setProperty("--panel-h", panelH + "px");
    geom = R.geometry(hostW, SIZE.h);
    cat.resize(hostW, SIZE.h);
  }
  layout();
  window.addEventListener("resize", () => { fitToMonitor(); layout(); paint(); });
  // Moving the window to another monitor doesn't always fire a resize, so check now and then.
  setInterval(() => { if (fitToMonitor()) { layout(); paint(); } }, 2000);
  try { chrome.storage.local.get("cat_pos").then((r) => { if (r && r.cat_pos) { pos = r.cat_pos; layout(); paint(); } }); } catch (e) {}

  // ---------- theme: follow the site's colors ----------
  CatExt.theme.watch((t) => {
    for (const k in t.vars) wrap.style.setProperty(k, t.vars[k]);
    wrap.style.setProperty("--c-font", t.font);
    cat.setColors({ ink: t.vars["--c-ink"], eye: t.vars["--c-eye"], yarn: t.vars["--c-yarn"], yarnDark: t.vars["--c-yarn-dark"] });
  });

  // ---------- the cat's face ----------
  // The cat reacts to what's happening: happy when it opens, thinking while an
  // answer is coming, a wink when a pack is copied, star eyes on merge, a
  // surprised face on errors, and sleepy when nobody has moved for a while.
  let face = "idle";
  function setFace(f) { face = f; cat.face(f); }
  function react(name) { face = "idle"; cat.react(name, "idle"); }
  let lastActive = Date.now();
  function wake() {
    lastActive = Date.now();
    if (face === "sleepy") { react("hello"); }
  }
  setInterval(() => { if (face === "idle" && goal === 0 && Date.now() - lastActive > 90000) setFace("sleepy"); }, 5000);

  // ---------- the cat timeline ----------
  // p goes from 0 (cat with its ball) to 1 (bar open). The loop only runs while p moves.
  let p = 0, goal = 0, last = 0, running = false, openedOnce = false;
  const clamp = (x) => Math.min(1, Math.max(0, x));
  function paint() {
    const st = cat.render(p, geom);
    if (!st) return;
    wrap.classList.toggle("open", p > 0.1 || goal === 1);
    wrap.classList.toggle("live", p > 0.97);
    const c = st.cut.toFixed(1);
    bar.style.clipPath = st.cut <= 0 ? "none" : mirror ? `inset(-20px ${c}px -20px -20px round 28px)` : `inset(-20px -20px -20px ${c}px round 28px)`;
    const q = clamp((p - 0.9) / 0.1);
    wrap.style.setProperty("--slash-o", Math.min(1, q * 2));
    wrap.style.setProperty("--slash-s", ((0.6 + 0.4 * q) * (1 + 0.12 * Math.sin(Math.PI * q))).toFixed(3));
    wrap.style.setProperty("--done", clamp((p - 0.92) / 0.08));
  }
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const dur = goal > p ? (openedOnce ? R.DURATION.reopen : R.DURATION.open) : R.DURATION.close;
    p = goal > p ? Math.min(goal, p + dt / dur) : Math.max(goal, p - dt / dur);
    paint();
    if (p === 1) openedOnce = true;
    if (p !== goal) requestAnimationFrame(frame);
    else running = false;
  }
  function go(t) {
    goal = t;
    if (!running && p !== goal) { running = true; requestAnimationFrame((now) => { last = now; frame(now); }); }
  }
  paint();

  // ---------- opening and closing: click the cat ----------
  let session = null, busy = false, mode = null, dragging = false, carrying = null;
  function openBar() {
    wake();
    if (film.heartsNext) { film.heartsNext = false; react("sharedlong"); } else react("hello");
    go(1);
    // Ready to type right away, while the ball is still rolling.
    setTimeout(() => input.focus(), 60);
  }
  function closeAll() {
    hideMenu();
    closePanel();
    input.value = "";
    autosize();
    input.blur();
    go(0);
  }
  closeX.addEventListener("click", closeAll);
  // One click opens or closes; a second click within a moment makes it a
  // double-tap, which picks the cat up instead.
  let clickTimer = null, justDragged = false;
  catHit.addEventListener("click", (e) => {
    if (justDragged) { justDragged = false; return; }
    if (carrying) return;
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; pickUp(e); return; }
    clickTimer = setTimeout(() => { clickTimer = null; goal === 1 ? closeAll() : openBar(); }, 230);
  });
  // Keep the page's highlighted text alive when the cat or a command is pressed.
  [catHit, ballBtn, menu].forEach((b) => b.addEventListener("mousedown", (e) => e.preventDefault()));

  // ---------- the / menu ----------
  let shown = [], active = 0;
  function showMenu(filter) {
    filter = (filter || "").toLowerCase();
    shown = COMMANDS.filter((c) => c.name.startsWith(filter));
    if (!shown.length) menu.innerHTML = '<div class="empty">No command called /' + filter.replace(/[<>&"]/g, "") + "</div>";
    else {
      menu.innerHTML = shown.map((c, i) => `
        <button type="button" class="item" role="option" data-i="${i}">
          <svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[c.name]}</svg>
          <span class="t"><span class="n">/${c.name}</span><span class="h">${c.hint}</span></span>
        </button>`).join("");
      menu.querySelectorAll(".item").forEach((b) => {
        b.addEventListener("mouseenter", () => setActive(+b.dataset.i));
        b.addEventListener("click", () => pick(+b.dataset.i));
      });
    }
    setActive(0);
    menu.classList.add("show");
    ballBtn.setAttribute("aria-expanded", "true");
  }
  function hideMenu() { menu.classList.remove("show"); ballBtn.setAttribute("aria-expanded", "false"); }
  function setActive(i) {
    active = i;
    menu.querySelectorAll(".item").forEach((b, j) => { b.classList.toggle("on", j === i); b.setAttribute("aria-selected", j === i ? "true" : "false"); });
  }
  function move(step) { if (shown.length) setActive((active + step + shown.length) % shown.length); }
  const RUN = { branch: () => startBranch(), merge: () => startMerge(), tree: () => startTree(), fork: () => startFork(), share: () => startShare(), clone: () => startClone(), key: () => startKey() };
  function pick(i) {
    const c = shown[i];
    if (!c) return;
    hideMenu();
    input.value = "";
    autosize();
    input.focus();
    RUN[c.name]();
  }
  ballBtn.addEventListener("click", () => { menu.classList.contains("show") ? hideMenu() : showMenu(""); input.focus(); });

  // ---------- the panel ----------
  function add(cls, text) {
    const el = document.createElement("div");
    el.className = cls;
    if (text !== undefined) el.textContent = text;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el;
  }
  function button(cls, label, onClick) {
    const b = document.createElement("button");
    b.type = "button"; b.className = cls; b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }
  function dots(el) { el.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>'; return el; }
  // Streams text into el as Markdown, at most once per frame.
  function streamer(el, still) {
    let pending = "", queued = false;
    return (t) => {
      pending = t;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; if (still()) { el.innerHTML = CatExt.markdown.render(pending); body.scrollTop = body.scrollHeight; } });
    };
  }

  // The panel shows one thing at a time: a branch, a share, a log, and so on.
  function openPanel(m, subText) {
    if (mode) closePanel();
    mode = m;
    chipIcon.innerHTML = ICONS[m];
    chipName.textContent = m;
    endBtn.textContent = m === "branch" ? "End" : "Close";
    sub.textContent = subText || "";
    body.textContent = "";
    panel.classList.add("show");
    return m;
  }
  function closePanel() {
    const old = session;
    session = null;
    busy = false;
    mode = null;
    if (old) CatExt.brain.close(old);
    panel.classList.remove("show");
    body.textContent = "";
    updateSend();
  }
  endBtn.addEventListener("click", () => { closePanel(); input.focus(); });

  // Shared error handling: no key yet shows the key setup, then tries again.
  function failed(err, m, retry) {
    setFace("idle");
    if (mode !== m) return;
    if (err && err.needsKey) { startKey(retry); return; }
    react("oops");
    add("err", errText(err));
  }

  // ---------- /branch ----------
  // A small button under each side answer: start a new branch of this side
  // chat from that point (the side chat itself stays as it is).
  function branchHere(branch, upTo) {
    const b = button("mini", "", () => startBranch(null, { branch, upTo }).then(() => input.focus()));
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS.branch + "</svg>Branch from here";
    b.setAttribute("aria-label", "Start a new branch of this side chat from this answer");
    body.appendChild(b);
  }

  async function startBranch(old, from) {
    if (session && !old && !from) return session;
    const m = openPanel("branch", "Reading the main chat");
    const d = dots(add(""));
    let s;
    try { s = await CatExt.brain.startBranch(old, from); } catch (err) { d.remove(); failed(err, m); return null; }
    if (mode !== m) return null;
    session = s;
    body.textContent = "";
    const n = s.main.messages.length;
    sub.textContent = n ? (s.main.source === "page-text" ? "read this page's text" : "knows the main chat, " + n + " messages") : "no chat to read here yet";
    if (s.branch.highlight) { add("label", "Highlighted in the main chat"); add("quote", s.branch.highlight); }
    if (s.main.error) add("note", "Could not load the chat data (" + s.main.error + "), so this side chat sees the page text instead.");
    if (s.branch.inherited && s.branch.inherited.length) {
      add("label", "A branch of a side chat. It starts from here:");
      s.branch.inherited.forEach((msg) => { if (msg.role === "you") add("you inh", msg.text); else add("ans inh").innerHTML = CatExt.markdown.render(msg.text); });
    }
    s.branch.messages.forEach((msg, i) => {
      if (msg.role === "you") add("you", msg.text);
      else { add("ans").innerHTML = CatExt.markdown.render(msg.text); branchHere(s.branch, i + 1); }
    });
    return s;
  }

  async function submit() {
    const q = input.value.trim();
    if (!q || busy) return;
    if (q.startsWith("/")) { if (menu.classList.contains("show") && shown.length) pick(active); return; }
    if (mode && mode !== "branch") closePanel();
    busy = true;
    updateSend();
    input.value = "";
    autosize();
    const s = session || (await startBranch());
    if (!s) { busy = false; updateSend(); return; }
    add("you", q);
    const out = dots(add("ans"));
    setFace("thinking");
    try {
      await CatExt.brain.send(s, q, streamer(out, () => mode === "branch"));
      setFace("idle");
      if (session === s) branchHere(s.branch, s.branch.messages.length);
      if (s.ai) sub.textContent = "answers from " + s.ai.who;
    } catch (err) {
      out.remove();
      if (s.branch.messages.length === 0 || !(err && err.needsKey)) {
        // Put the question back so nothing typed is lost.
        if (!input.value) { input.value = q; autosize(); }
      }
      failed(err, "branch", () => { startBranch(); });
    }
    busy = false;
    updateSend();
    input.focus();
  }

  // ---------- /merge: bring a side chat back into the main chat ----------
  async function startMerge() {
    let branch = session && session.branch.messages.length ? session.branch : null;
    if (!branch) {
      const t = await CatExt.brain.tree();
      branch = t.branches.slice().sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))[0] || null;
    }
    const m = openPanel("merge", "Bring what you learned back into the main chat");
    if (!branch) { add("note", "There's no side chat to merge yet. Ask a side question first (or use /branch)."); return; }
    add("label", "From the side chat: " + (branch.messages[0] ? branch.messages[0].text.slice(0, 80) : ""));
    const preview = dots(add("ans"));
    setFace("thinking");
    let note;
    try { note = await CatExt.brain.mergeNote(branch, streamer(preview, () => mode === m)); } catch (err) { preview.remove(); failed(err, m, startMerge); return; }
    setFace("idle");
    if (mode !== m) return;
    body.textContent = "";
    sub.textContent = "Edit it if you like, then put it in the chat";
    add("label", "Note for the main chat (you can edit it)");
    const box = document.createElement("textarea");
    box.className = "pack"; box.id = "cat-merge"; box.style.minHeight = "120px";
    box.setAttribute("aria-label", "Note for the main chat, editable");
    box.value = note;
    body.appendChild(box);
    const actions = add("actions");
    const status = add("note");
    actions.append(button("primary", "Put it in the chat box", () => {
      const ok = site.insert(box.value.trim());
      if (ok) {
        CatExt.brain.markMerged(branch);
        react("merge");
        status.textContent = "It's in the chat box. Read it and press send when you're ready.";
        sr.textContent = "Merged into the chat box.";
      } else {
        status.textContent = "Couldn't find this site's chat box, so copy it instead.";
        copyText(box.value, status);
      }
    }), button("secondary", "Copy", () => copyText(box.value, status)));
  }

  // ---------- /tree: everything that grew out of this chat ----------
  // The main chat runs down the left as a line of dots. Side chats hang off
  // the message they came from, and branches of side chats hang off those.
  // The chat this one was forked or cloned from sits on top, and chats
  // forked from this one sit at the bottom.
  const STEP = 34, TRUNK = 12;
  async function startTree() {
    const m = openPanel("tree", "Everything that grew out of this chat");
    const d = dots(add(""));
    let t;
    try { t = await CatExt.brain.tree(); } catch (err) { d.remove(); failed(err, m); return; }
    if (mode !== m) return;
    d.remove();
    const msgs = t.main.messages;
    if (!msgs.length && !t.branches.length) { add("note", "Nothing here yet. Ask a side question and it shows up in the tree."); return; }

    // Where each side chat hangs: its saved snippet, or its saved position.
    const norm = (x) => x.replace(/\s+/g, " ");
    const anchorAt = (b) => {
      if (b.anchorSnippet) { const i = msgs.findIndex((mm) => norm(mm.text).startsWith(b.anchorSnippet.slice(0, 50))); if (i >= 0) return i; }
      return Math.max(0, Math.min(msgs.length - 1, b.anchorIndex == null ? msgs.length - 1 : b.anchorIndex));
    };
    const byId = new Map(t.branches.map((b) => [b.id, b]));
    const kids = new Map(), tops = new Map();
    t.branches.forEach((b) => {
      if (b.parentId && byId.has(b.parentId)) kids.set(b.parentId, (kids.get(b.parentId) || []).concat(b));
      else { const i = anchorAt(b); tops.set(i, (tops.get(i) || []).concat(b)); }
    });

    // Rows, top to bottom. Long chats fold the messages nothing hangs from.
    const rows = [];
    if (t.parentLink) rows.push({ kind: "link", depth: 1, label: (t.parentLink.kind === "clone" ? "Cloned from a teammate's pack: " : "Forked from: ") + (t.parentLink.title || "a chat"), href: t.parentLink.fromHref, up: true });
    const keep = new Set([0, msgs.length - 1, msgs.length - 2, ...tops.keys()]);
    let hidden = 0, firstMsgRow = -1, lastMsgRow = -1;
    const addSide = (b, depth, parentRow) => {
      const row = rows.push({ kind: "side", depth, b, parentRow }) - 1;
      (kids.get(b.id) || []).forEach((k) => addSide(k, depth + 1, row));
    };
    msgs.forEach((mm, i) => {
      if (!keep.has(i)) { hidden++; return; }
      if (hidden) { rows.push({ kind: "gap", depth: 0, label: hidden + " more message" + (hidden > 1 ? "s" : "") }); hidden = 0; }
      const row = rows.push({ kind: "msg", depth: 0, mm }) - 1;
      if (firstMsgRow < 0) firstMsgRow = row;
      lastMsgRow = row;
      (tops.get(i) || []).forEach((b) => addSide(b, 1, row));
    });
    t.childLinks.forEach((l) => rows.push({ kind: "link", depth: 1, label: (l.kind === "clone" ? "Clone: " : "Fork: ") + (l.title || "a chat"), href: l.toHref, down: true }));

    // Draw: lines in one SVG behind, rows as buttons on top.
    const box = add("tree");
    const W = body.clientWidth - 28, H = rows.length * STEP;
    box.style.height = H + "px";
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "lines"); svg.setAttribute("width", W); svg.setAttribute("height", H);
    box.appendChild(svg);
    const line = (dd, color) => { const p = document.createElementNS(svgNS, "path"); p.setAttribute("d", dd); p.setAttribute("stroke", color); svg.appendChild(p); return p; };
    const ink = getComputedStyle(wrap).getPropertyValue("--c-muted").trim() || "#888";
    const yarn = getComputedStyle(wrap).getPropertyValue("--c-yarn").trim() || "#4A6884";
    const leftOf = (r) => (r.depth === 0 ? TRUNK : 26 + (r.depth - 1) * 20);
    const mid = (i) => i * STEP + 14;
    // The trunk, from the first message to the last row that hangs off it.
    const trunkEnd = rows.reduce((e, r, i) => (r.kind === "link" && r.down ? i : e), lastMsgRow);
    const trunkStart = t.parentLink ? 0 : firstMsgRow;
    if (trunkStart >= 0 && trunkEnd >= 0) line(`M${TRUNK} ${mid(trunkStart)}V${mid(trunkEnd)}`, ink);
    rows.forEach((r, i) => {
      const y = mid(i), x = leftOf(r);
      if (r.kind === "msg") {
        const c = document.createElementNS(svgNS, "circle");
        c.setAttribute("cx", TRUNK); c.setAttribute("cy", y); c.setAttribute("r", 5); c.setAttribute("fill", ink);
        svg.appendChild(c);
      } else if (r.kind === "side") {
        const pr = rows[r.parentRow];
        if (pr.kind === "msg") line(`M${TRUNK} ${mid(r.parentRow)}C${TRUNK + 10} ${y} ${x - 10} ${y} ${x} ${y}`, yarn);
        else { const px = leftOf(pr) + 10; line(`M${px} ${mid(r.parentRow) + 14}V${y}H${x}`, yarn); }
      } else if (r.kind === "link") {
        line(`M${TRUNK} ${y}H${x}`, "#2E8B7A");
      }
      const el = document.createElement("button");
      el.type = "button"; el.className = "row " + r.kind;
      el.style.top = i * STEP + "px"; el.style.left = (r.kind === "msg" || r.kind === "gap" ? TRUNK + 12 : x) + "px";
      el.style.maxWidth = W - (r.kind === "msg" || r.kind === "gap" ? TRUNK + 12 : x) + "px";
      const lbl = document.createElement("span"); lbl.className = "lbl";
      if (r.kind === "msg") {
        const who = document.createElement("span"); who.className = "who"; who.textContent = r.mm.role === "you" ? "You:" : r.mm.role === "ai" ? "AI:" : "Page:";
        el.append(who);
        lbl.textContent = norm(r.mm.text).slice(0, 90);
        el.setAttribute("aria-label", "Show this message in the chat: " + lbl.textContent);
        el.addEventListener("click", () => scrollToText(r.mm.text));
      } else if (r.kind === "side") {
        lbl.textContent = r.b.messages[0].text;
        el.setAttribute("aria-label", "Reopen side chat: " + lbl.textContent);
        el.addEventListener("click", () => startBranch(r.b).then(() => input.focus()));
      } else if (r.kind === "link") {
        lbl.textContent = r.label;
        if (r.href) el.addEventListener("click", () => location.assign(r.href));
        else { el.disabled = true; el.title = "That chat gets its address once its first message is sent"; }
      } else { lbl.textContent = "··· " + r.label; el.disabled = true; }
      el.append(lbl);
      if (r.kind === "side") {
        const n = Math.round(r.b.messages.length / 2);
        const tag = document.createElement("span"); tag.className = "tag"; tag.textContent = r.b.mergedAt ? "merged" : n + (n > 1 ? " questions" : " question");
        el.append(tag);
      }
      box.appendChild(el);
    });
    react("hello");
  }

  // Scrolls the real chat to a message and flashes it.
  function scrollToText(text) {
    const probe = text.replace(/\s+/g, " ").trim().slice(0, 30);
    if (!probe) return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode, el = n.parentElement;
      if (!el || el.closest("nav, aside, header, #cat-ext-host")) continue;
      if (!n.textContent.replace(/\s+/g, " ").includes(probe.slice(0, 20))) continue;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      try { el.animate([{ backgroundColor: "rgba(255,200,69,.55)" }, { backgroundColor: "rgba(255,200,69,0)" }], { duration: 1800 }); } catch (e) {}
      return;
    }
    sr.textContent = "Couldn't find that message on the page.";
  }

  // ---------- /share and /fork: a memory pack ----------
  async function writePack(m, onReady) {
    add("note", "Summing up this chat on the side. The main chat stays as it is.");
    const preview = dots(add("ans"));
    setFace("thinking");
    let pack;
    try { pack = await CatExt.brain.makePack(streamer(preview, () => mode === m)); } catch (err) { preview.remove(); failed(err, m, () => RUN[m]()); return; }
    setFace("idle");
    if (mode !== m) return;
    onReady(CatExt.brain.wrapPack(pack.title, pack.body));
  }

  function packEditor(text, how, actionsFor) {
    sub.textContent = "Read it, edit anything you like";
    body.textContent = "";
    add("label", "Memory pack (you can edit it)");
    const box = document.createElement("textarea");
    box.className = "pack"; box.id = "cat-pack";
    box.setAttribute("aria-label", "Memory pack, editable");
    box.value = text;
    body.appendChild(box);
    const warn = add("warn");
    const actions = add("actions");
    const status = add("note");
    actionsFor(box, actions, status);
    const note = document.createElement("span"); note.className = "note"; note.textContent = how;
    actions.append(note);
    function check() {
      const hits = CatExt.brain.findSecrets(box.value);
      warn.style.display = hits.length ? "" : "none";
      warn.innerHTML = hits.length ? "<b>Check before sending.</b> These lines look private:<ul>" +
        hits.slice(0, 6).map((h) => "<li>Line " + h.line + " looks like " + h.what + "</li>").join("") + "</ul>" : "";
    }
    box.addEventListener("input", check);
    check();
    body.scrollTop = 0;
  }

  async function copyText(text, status) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
      const t = document.createElement("textarea"); t.value = text; body.appendChild(t); t.select();
      try { ok = document.execCommand("copy"); } catch (e2) {}
      t.remove();
    }
    if (ok) react("copied");
    if (status) status.textContent = ok ? "Copied." : "Couldn't copy automatically. Select the text and copy it.";
    sr.textContent = ok ? "Copied." : "Could not copy automatically.";
    return ok;
  }

  function startShare() {
    const m = openPanel("share", "Writing a memory pack from this chat");
    writePack(m, (text) => packEditor(text, "Your teammate pastes it into their cat with /clone, on any AI site.", (box, actions, status) => {
      actions.append(button("primary", "Copy pack", async () => { if (await copyText(box.value, status)) setTimeout(() => react("shared"), 1300); }));
    }));
  }

  function startFork() {
    const m = openPanel("fork", "A fresh chat that remembers this one");
    writePack(m, (text) => packEditor(text, site.account ? "Opens as a new chat in your account." : "Opens a new chat with the pack ready in the box.", (box, actions, status) => {
      const b = button("primary", "Start the fresh chat", async () => {
        b.disabled = true;
        status.textContent = "Starting the new chat...";
        try { const url = await CatExt.brain.forkWith(box.value); react("merge"); setTimeout(() => location.assign(url), 900); }
        catch (err) { status.className = "err"; status.textContent = errText(err); b.disabled = false; }
      });
      actions.append(b);
    }));
  }

  // ---------- /clone: start a chat from a teammate's pack ----------
  function startClone() {
    openPanel("clone", "Start a chat from a teammate's memory pack");
    add("label", "Paste the memory pack here");
    const box = document.createElement("textarea");
    box.className = "pack"; box.id = "cat-clone";
    box.setAttribute("aria-label", "Paste a memory pack");
    box.placeholder = "===== CAT MEMORY PACK v1 =====";
    body.appendChild(box);
    const actions = add("actions");
    const status = add("note");
    const b = button("primary", "Start the chat", async () => {
      b.disabled = true; box.readOnly = true;
      status.className = "note";
      status.textContent = "Loading the pack into a new chat...";
      try {
        const url = await CatExt.brain.clonePack(box.value);
        status.textContent = "Done. Opening the new chat.";
        react("hello");
        location.assign(url);
      } catch (err) {
        status.className = "err"; status.textContent = errText(err);
        b.disabled = false; box.readOnly = false;
      }
    });
    b.disabled = true;
    const how = document.createElement("span"); how.className = "note";
    how.textContent = site.account ? "It opens as a new chat in your account." : "It opens a new chat with the pack ready in the box.";
    actions.append(b, how);
    box.addEventListener("input", () => { b.disabled = box.value.trim().length < 40; });
    setTimeout(() => box.focus(), 50);
  }

  // ---------- /key: the free Gemini key ----------
  async function startKey(then) {
    openPanel("key", site.account ? "Only needed on sites other than Claude" : "So the cat can answer on " + site.name);
    const s = await CatExt.ai.settings();
    const intro = add("note");
    intro.innerHTML = (site.account ? "On Claude, the cat uses your own account. " : "On " + site.name.replace(/[<>&]/g, "") + ", the cat answers with Google's Gemini. ") +
      'Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> and paste it here. It stays in this browser only.';
    const inp = document.createElement("input");
    inp.type = "password"; inp.className = "keyin"; inp.id = "cat-key"; inp.autocomplete = "off";
    inp.setAttribute("aria-label", "Gemini API key"); inp.placeholder = "Paste your Gemini key";
    inp.value = s.geminiKey || "";
    body.appendChild(inp);
    const actions = add("actions");
    const status = add("note");
    const save = button("primary", "Save key", async () => {
      await CatExt.ai.saveSettings({ geminiKey: inp.value.trim() });
      status.textContent = inp.value.trim() ? "Saved." : "Key removed.";
      react("hello");
      if (then && inp.value.trim()) setTimeout(then, 500);
    });
    actions.append(save);
    setTimeout(() => inp.focus(), 50);
  }

  // ---------- typing ----------
  function autosize() { input.style.height = "44px"; input.style.height = Math.min(input.scrollHeight, 150) + "px"; }
  function updateSend() {
    const v = input.value.trim();
    sendBtn.disabled = busy || !v || (v.startsWith("/") && !menu.classList.contains("show"));
  }
  input.addEventListener("input", () => {
    autosize();
    const m = input.value.match(/^\/(\w*)$/);
    m ? showMenu(m[1]) : hideMenu();
    updateSend();
  });
  // Enter sends. Tab+Enter (hold Tab, press Enter) or Shift+Enter makes a new line.
  let tabHeld = false;
  input.addEventListener("keydown", (e) => {
    const menuOpen = menu.classList.contains("show");
    if (menuOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); move(e.key === "ArrowDown" ? 1 : -1); return; }
    if (e.key === "Escape") { e.preventDefault(); menuOpen ? hideMenu() : closeAll(); return; }
    if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); if (menuOpen) { pick(active); return; } tabHeld = true; return; }
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
  // Stop the chat site from reacting to keys typed inside the cat.
  ["keydown", "keyup", "keypress"].forEach((type) => host.addEventListener(type, (e) => e.stopPropagation()));
  root.addEventListener("mousedown", (e) => {
    if (menu.classList.contains("show") && !menu.contains(e.target) && e.target !== ballBtn && !ballBtn.contains(e.target) && e.target !== input) hideMenu();
  });

  // ---------- switching chats ----------
  // These sites change chats without reloading the page, so we watch for it.
  // A side chat belongs to the chat it was opened from, so it ends on a switch.
  let lastKey = site.chatKey();
  setInterval(() => {
    const k = site.chatKey();
    if (k === lastKey) return;
    lastKey = k;
    site.resetSelection();
    if (mode) closePanel();
  }, 500);
  window.addEventListener("pagehide", () => { if (session) CatExt.brain.close(session); });

  // A new chat on ChatGPT, Gemini or Grok gets its own address when you send
  // the first message. Then the tree link from the old chat is finished.
  function waitForAddress(linkId) {
    const start = site.chatKey();
    const timer = setInterval(() => {
      if (site.chatKey() === start) return;
      clearInterval(timer);
      CatExt.brain.finishLink(linkId);
    }, 1000);
    setTimeout(() => clearInterval(timer), 30 * 60 * 1000);
  }

  // Text left by /fork or /clone on the last page goes into this page's box.
  (async () => {
    let pend = null;
    try { pend = await site.takeLeftText(); } catch (e) {}
    if (!pend) return;
    if (pend.linkId) waitForAddress(pend.linkId);
    for (let i = 0; i < 40; i++) {
      if (site.composer()) { site.insert(pend.text); react("hello"); sr.textContent = "The memory pack is in the chat box. Press send to start."; return; }
      await new Promise((r) => setTimeout(r, 400));
    }
  })();

  // ---------- staying alive: blinking, watching your mouse ----------
  R.startBlinking((v) => cat.blink(v));
  let mouse = null, lookQueued = false;
  document.addEventListener("mousemove", (e) => {
    lastActive = Date.now();
    if (face === "sleepy" && !film.on) wake(); // in film mode, only a click wakes it
    const r = host.getBoundingClientRect();
    mouse = [mirror ? r.right - e.clientX : e.clientX - r.left, e.clientY - r.top];
    if (carrying) carryTo(e.clientX, e.clientY);
    if (!lookQueued) { lookQueued = true; requestAnimationFrame(() => { lookQueued = false; cat.look(mouse); }); }
  }, { passive: true });
  document.addEventListener("keydown", () => { lastActive = Date.now(); }, true);
  document.addEventListener("mouseleave", () => cat.look(null));

  // ---------- moving the cat ----------
  // Two ways, with the bar open or closed: double-tap it and it follows your
  // pointer until you tap again (Escape puts it back), or press, hold for a
  // moment (0.15 seconds), and drag.
  function lift() {
    wrap.classList.add("carrying");
    host.style.transformOrigin = (mirror ? CAT_R : hostW - CAT_R) + "px " + (SIZE.h - CAT_R) + "px";
    host.style.transition = "transform .15s ease, filter .15s ease";
    host.style.transform = "translateY(-4px) scale(1.06)";
    host.style.filter = "drop-shadow(0 10px 10px rgba(0,0,0,.22))";
    setFace("happy");
  }
  function land() {
    wrap.classList.remove("carrying", "dragging");
    host.style.transition = ""; host.style.transform = ""; host.style.filter = "";
    try { host.animate([{ transform: "scale(1.08, 0.9)" }, { transform: "scale(0.97, 1.04)" }, { transform: "none" }], { duration: 260, easing: "ease-out" }); } catch (err) {}
    try { chrome.storage.local.set({ cat_pos: pos }); } catch (err) {}
    react("hello");
  }
  function carryTo(x, y) {
    const W = window.innerWidth, H = window.innerHeight;
    pos = { fx: x / W, fy: y / H };
    layout(); paint();
    host.style.transformOrigin = (mirror ? CAT_R : hostW - CAT_R) + "px " + (SIZE.h - CAT_R) + "px";
  }
  // Works with the bar open too: the bar and panel move along with the cat.
  function pickUp(e) {
    hideMenu();
    carrying = { from: pos };
    lift();
    carryTo(e.clientX, e.clientY);
    sr.textContent = "Cat picked up. Move your pointer and tap to drop it. Escape puts it back.";
    // The next tap anywhere drops it; that tap doesn't reach the page.
    setTimeout(() => {
      document.addEventListener("pointerdown", dropTap, true);
      document.addEventListener("keydown", escCarry, true);
    }, 0);
  }
  function endCarry() {
    document.removeEventListener("pointerdown", dropTap, true);
    document.removeEventListener("keydown", escCarry, true);
    carrying = null;
    land();
  }
  function swallowClick(e) { e.preventDefault(); e.stopPropagation(); }
  function dropTap(e) {
    e.preventDefault(); e.stopPropagation();
    document.addEventListener("click", swallowClick, { capture: true, once: true });
    setTimeout(() => document.removeEventListener("click", swallowClick, true), 400);
    justDragged = true; setTimeout(() => { justDragged = false; }, 400);
    carryTo(e.clientX, e.clientY);
    endCarry();
    sr.textContent = "Cat dropped.";
  }
  function escCarry(e) {
    if (e.key !== "Escape") return;
    e.preventDefault(); e.stopPropagation();
    pos = carrying.from; layout(); paint();
    endCarry();
    sr.textContent = "Cat put back.";
  }

  // Press and hold, then drag.
  let holdTimer = null, start = null, grab = null;
  catHit.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || carrying) return;
    start = [e.clientX, e.clientY];
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      dragging = true;
      clearTimeout(clickTimer); clickTimer = null;
      try { catHit.setPointerCapture(e.pointerId); } catch (err) {}
      const W = window.innerWidth, H = window.innerHeight;
      grab = [start[0] - pos.fx * W, start[1] - pos.fy * H];
      wrap.classList.add("dragging");
      lift();
      sr.textContent = "Cat picked up. Move it and let go.";
    }, 150);
  });
  catHit.addEventListener("pointermove", (e) => {
    if (!dragging) {
      if (start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 6) { clearTimeout(holdTimer); start = null; }
      return;
    }
    carryTo(e.clientX - grab[0], e.clientY - grab[1]);
  });
  function drop() {
    clearTimeout(holdTimer);
    start = null;
    if (!dragging) return;
    dragging = false;
    justDragged = true;
    setTimeout(() => { justDragged = false; }, 400);
    land();
    sr.textContent = "Cat dropped.";
  }
  catHit.addEventListener("pointerup", drop);
  catHit.addEventListener("pointercancel", drop);

  // ---------- film mode (for making demo videos) ----------
  // Off by default. Ctrl+Shift+F turns it on or off. While on:
  //   Ctrl+Shift+1  the cat falls asleep right away
  //   Ctrl+Shift+2  the next click on the cat gives heart eyes
  //   Ctrl+Shift+3  one slow blink
  //   Ctrl+Shift+9  the cat pops into pixels and disappears
  //   Ctrl+Shift+0  the cat comes back
  const film = { on: false, heartsNext: false };
  try { chrome.storage.local.get("cat_film").then((r) => { film.on = !!(r && r.cat_film); }); } catch (e) {}
  function popCat() {
    const z = R.size ? R.size() : null;
    const ox = mirror ? (z ? z.CAT_R : 30) : hostW - (z ? z.CAT_R : 30), oy = SIZE.h - (z ? z.CAT_R : 30);
    canvas.style.transformOrigin = ox + "px " + oy + "px";
    const base = mirror ? "scaleX(-1) " : "";
    try {
      const a = canvas.animate([{ transform: base + "scale(1)" }, { transform: base + "scale(1.12, 0.88)" }, { transform: base + "scale(1.22)" }], { duration: 220, easing: "ease-in" });
      a.onfinish = () => { canvas.style.transform = ""; cat.pop(); };
    } catch (e) { cat.pop(); }
  }
  document.addEventListener("keydown", (e) => {
    if (!e.ctrlKey || !e.shiftKey) return;
    const k = e.code;
    if (k === "KeyF") {
      film.on = !film.on;
      try { chrome.storage.local.set({ cat_film: film.on }); } catch (err) {}
      sr.textContent = film.on ? "Film mode on." : "Film mode off.";
      react(film.on ? "copied" : "hello");
    } else if (!film.on) return;
    else if (k === "Digit1") { if (goal === 1) closeAll(); setFace("sleepy"); }
    else if (k === "Digit2") { film.heartsNext = true; }
    else if (k === "Digit3") { // one slow blink
      const t0 = performance.now();
      (function step(now) { const t = (now - t0) / 260; cat.blink(t >= 1 ? 0 : Math.sin(Math.PI * t)); if (t < 1) requestAnimationFrame(step); })(t0);
    }
    else if (k === "Digit9") { if (goal === 1) closeAll(); setTimeout(popCat, goal === 1 ? 700 : 0); }
    else if (k === "Digit0") { cat.unpop(); react("hello"); }
    else return;
    e.preventDefault(); e.stopPropagation();
  }, true);

  document.documentElement.appendChild(host);
})();
