// CAT ROLL: the cat swats its yarn ball to the left, and the chat bar unrolls
// behind the ball. The bar is made of the ball's yarn, so the ball shrinks as
// it rolls and is used up when the bar is fully open.
//
// Two looks, same cat:
//   "pixel"  the shapes are drawn on a small canvas (one pixel = PX screen
//            pixels), cleaned up to a few solid colors and shown with sharp
//            edges. Faces are hand-placed pixel sprites.
//   "smooth" the same shapes drawn sharp at full resolution, with soft shading
//            on the head and ball, and faces drawn as vector shapes.
//
// What makes it cute (baby schema research and character design practice):
// big eyes set low and wide, large pupils with two shine spots, a small mouth
// right under the nose, soft blush under the eyes, and small signs of life
// (breathing, blinking, eyes that follow you, pupils that grow when you come
// close, and a paw that bats the ball now and then).
//
// p is the timeline, from 0 (cat resting with its ball) to 1 (bar fully open):
//   0.00 to 0.06  the paw lifts back, winding up
//   0.06 to 0.12  the paw swats the ball, and the ball squashes on impact
//   0.12 to 0.96  the ball rolls left and unwinds into the bar
//   0.12 to 0.40  the paw swings through a little and settles
//   0.40 to 0.85  the stretched thread fades away
// Running p backwards closes it: the yarn winds back into a ball that rolls home.
(function () {
  const CatExt = (window.CatExt = window.CatExt || {});
  const L = CatExt.logo;

  // The cat's size follows the monitor. PX is how many screen pixels one
  // pixel-art pixel takes: about 2 on a 1080p screen, more on bigger ones.
  // It is snapped so each art pixel covers a whole number of real device
  // pixels, which keeps the pixel art sharp at any display scaling.
  let PX = 2, K = 0, CAT_W = 60;     // K: picture pixels to screen pixels; CAT_W: room the cat takes beside the bar
  const BAR_H = 57;                  // the chat bar's height (part of the UI, it doesn't scale with the cat)
  function setPx(px) { PX = px; K = (25 / L.ball.r) * (PX / 3); CAT_W = Math.round(30 * PX); }
  setPx(2);
  function pickPx() {
    const dpr = window.devicePixelRatio || 1;
    // The monitor's size in CSS pixels (already includes the OS display scaling).
    // A very wide monitor counts by its height, so ultrawides don't get a giant cat.
    const size = Math.min(screen.height || 1080, (screen.width || 1920) * 0.5625);
    const target = Math.min(3.2, Math.max(1.5, (2 * size) / 1080));
    return Math.max(2, Math.round(target * dpr)) / dpr;
  }
  const size = () => ({ PX, K, CAT_W, BAR_H, CAT_R: Math.round(15 * PX) });
  const DURATION = { open: 1.7, reopen: 1.0, close: 0.6 };

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const rollEase = (x) => { x = clamp(x); return 1 - Math.pow(1 - x, 2.4); };
  const bump = (p, a, b, c) => (p <= a || p >= c ? 0 : p < b ? ease((p - a) / (b - a)) : 1 - ease((p - b) / (c - b)));

  // Where everything sits, for a host box of width w and height h.
  function geometry(w, h) {
    const X0 = w - 6 - 806 * K;
    const Y0 = h - BAR_H / 2 - L.ball.cy * K;
    const barR = w - CAT_W, barL = 0;
    const restX = X0 + L.ball.cx * K;
    return { w, h, X0, Y0, barL, barR, barW: barR - barL, restX, endX: barL, ballY: h - BAR_H / 2,
             headX: X0 + 640 * K, headY: Y0 + 540 * K };
  }

  // ---------- the roll ----------
  const T = L.thread, TN = T.length / 2, TS = new Array(TN);
  (function () {
    let acc = 0; TS[0] = 0;
    for (let i = 1; i < TN; i++) { acc += Math.hypot(T[2 * i] - T[2 * i - 2], T[2 * i + 1] - T[2 * i - 1]); TS[i] = acc; }
    for (let i = 0; i < TN; i++) TS[i] /= acc;
  })();
  const PAW_PIVOT = [T[0], T[1]];
  const PAW = [[0, 0, 0, 0], [0.06, 18, -26, 14], [0.12, -22, 26, -16], [0.26, 7, -8, 5], [0.4, 0, 0, 0]];
  function pawAt(p) {
    for (let i = 0; i < PAW.length - 1; i++) {
      const a = PAW[i], b = PAW[i + 1];
      if (p >= a[0] && p <= b[0]) { const t = ease((p - a[0]) / (b[0] - a[0])); return [lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)]; }
    }
    return [0, 0, 0];
  }
  const ballX = (g, p) => lerp(g.restX, g.endX, rollEase((p - 0.12) / 0.84));
  // The ball's area shrinks in step with the distance rolled: radius ~ sqrt(1 - t).
  const yarnLeft = (g, bx) => Math.sqrt(1 - clamp((g.restX - bx) / (g.restX - g.endX)));

  // Everything about frame p, in picture pixels. fid (0..1) is the idle paw tap.
  function pose(p, g, fid = 0) {
    const bx = ballX(g, p), s = yarnLeft(g, bx);
    const r = L.ball.r * s, dImg = (bx - g.restX) / K, dyImg = L.ball.r - r;
    const D = (g.restX - g.endX) / K;
    const hit = bump(p, 0.1, 0.13, 0.22);
    const l = Math.sin(Math.PI * clamp(p / 0.4));
    const paw = pawAt(p);
    const tap = Math.sin(Math.PI * clamp(fid * 1.6)), nudge = Math.sin(Math.PI * clamp((fid - 0.3) / 0.7));
    paw[1] -= 12 * tap; paw[0] += 6 * tap; paw[2] -= 12 * tap;
    return {
      bx, s,
      ball: { cx: L.ball.cx + dImg - 5 * nudge, cy: L.ball.cy + dyImg + L.ball.r * 0.1 * hit, sx: s * (1 + 0.12 * hit), sy: s * (1 - 0.1 * hit),
              angle: -2 * (1 - s) * D / L.ball.r - 0.2 * nudge, alpha: ease((s - 0.04) / 0.16), r },
      paw, lean: [-8 * l, 4 * l], dImg, dyImg,
      threadAlpha: 1 - ease((p - 0.4) / 0.45),
      rolling: p > 0.04 && p < 0.97,
      cut: p >= 0.999 ? 0 : Math.max(0, bx - g.barL),
    };
  }

  // ---------- the face, in the face's own tilted frame ----------
  // The head is tilted about 30 degrees. Face points are given in a frame that
  // turns with the head: origin between the eyes, x along the eye line, y down.
  const TH = Math.atan2(561.5 - 505, 680 - 584), CO = Math.cos(TH), SI = Math.sin(TH);
  const FC = [632, 533.25];
  const toPic = (x, y) => [FC[0] + x * CO - y * SI, FC[1] + x * SI + y * CO];
  // Eyes moved a little lower and spread evenly around the nose (which sits
  // at about x = 8 in this frame), and made bigger and rounder.
  const SPOT = { eyeL: [-48, 5], eyeR: [64, 5], nose: [4, 31], mouth: [8, 58], blushL: [-62, 42], blushR: [80, 42] };
  const ER = 33; // eye radius in picture pixels (smooth look)

  //            left eye, right eye, mouth, blush strength
  const FACES = {
    idle: ["open", "open", "w", 0.55], happy: ["happy", "happy", "open", 0.9], thinking: ["up", "up", "hmm", 0.4],
    star: ["star", "star", "wide", 0.9], wink: ["happy", "open", "tongue", 0.8], surprised: ["round", "round", "o", 0.5],
    sleepy: ["closed", "closed", "small", 0.45], love: ["heart", "heart", "open", 1],
    blink: ["closed", "closed", "w", 0.55], gasp: ["shut", "shut", "wide", 0.9],
  };

  // ---------- pixel sprites ----------
  // Letters: l = light (eye white, mouth lines), b = iris (yarn blue),
  // d = pupil, w = shine, p = blush / tongue, y / Y = star gold and its center,
  // h = heart red, k = the cat's ink. "." is see-through.
  const grid = (rows, ox, oy) => {
    const o = [];
    rows.forEach((r, y) => [...r].forEach((c, x) => { if (c !== ".") o.push([x - ox, y - oy, c]); }));
    return o;
  };
  const PIX_EYE = {
    // A big shiny pupil with a thin light rim: dark on top, yarn blue at the
    // bottom, and a shine spot boxed in by dark so it reads as a sparkle.
    open(lx, ly, blink, dil) {
      const mask = [".lll.", "lllll", "lllll", "lllll", "lllll", ".lll."];
      const inner = dil ? ["ddd", "dwd", "ddd", "ddd"] : ["ddd", "dwd", "ddd", "bbb"];
      const lid = Math.round(blink * 6);
      const out = [];
      for (let y = 0; y < 6; y++) for (let x = 0; x < 5; x++) {
        if (mask[y][x] === ".") continue;
        if (y < lid) continue; // eyelid: the head's ink shows through
        const ix = x - 1 - lx, iy = y - 1 - ly;
        const c = ix >= 0 && ix <= 2 && iy >= 0 && iy <= 3 ? inner[iy][ix] : "l";
        out.push([x - 2, y - 3, c]);
      }
      return out;
    },
    up: (lx, ly, blink, dil) => PIX_EYE.open(1, -1, Math.max(blink, 0.34), dil),
    happy: () => grid([".lll.", "l...l"], 2, 1),
    closed: () => grid(["l...l", ".lll."], 2, 0),
    shut: (lx, ly, b, dl, side) => grid(side ? ["..l", ".l.", "l..", ".l.", "..l"] : ["l..", ".l.", "..l", ".l.", "l.."], 1, 2),
    round: () => grid([".lll.", "lllll", "llwll", "lldll", "lllll", ".lll."], 2, 3),
    star: () => grid(["..y..", ".yyy.", "yyYyy", ".yyy.", ".y.y."], 2, 2),
    heart: () => grid(["hh.hh", "hwhhh", "hhhhh", ".hhh.", "..h.."], 2, 2),
  };
  const PIX_MOUTH = {
    w: grid(["l.l.l", ".l.l."], 2, 0),
    open: grid(["lllll", "lpppl", ".lll."], 2, 0),
    tongue: grid(["l.l.l", ".lpl.", "..p.."], 2, 0),
    wide: grid(["lllllll", "l.....l", "lpppppl", ".lllll."], 3, 0),
    o: grid([".l.", "l.l", ".l."], 1, 0),
    hmm: grid(["ll...", "..lll"], 2, 0),
    small: grid(["ll"], 0, 0),
  };
  // Extras float above the head; f is a frame number that ticks every 400ms.
  const plus = (x, y, c) => [[x, y - 1, c], [x - 1, y, c], [x, y, c], [x + 1, y, c], [x, y + 1, c]];
  const rect = (x0, y0, x1, y1, c) => { const o = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) o.push([x, y, c]); return o; };
  const PIX_EXTRA = {
    thinking: (f) => [[8, -9, "k"], ...(f % 3 >= 1 ? rect(10, -12, 11, -11, "k") : []), ...(f % 3 >= 2 ? rect(13, -16, 15, -14, "k") : [])],
    star: (f) => (f % 2 ? plus(-9, -10, "y").concat(plus(11, -12, "y")) : plus(-10, -12, "y").concat(plus(12, -9, "y"))),
    wink: () => plus(10, -10, "y"),
    happy: (f) => (f % 2 ? plus(10, -11, "y") : plus(-9, -10, "y")),
    surprised: () => rect(11, -16, 11, -13, "k").concat([[11, -11, "k"]]),
    sleepy: (f) => {
      const z = (x, y) => rect(x, y, x + 2, y, "k").concat([[x + 1, y + 1, "k"]]).concat(rect(x, y + 2, x + 2, y + 2, "k"));
      return z(9, -10 - (f % 2)).concat(f % 2 ? z(12, -15) : []);
    },
    love: (f) => grid(["h.h", "hhh", ".h."], 0, 0).map(([x, y, c]) => [x + 10, y - 12 - (f % 3), c]),
  };

  // ---------- drawing ----------
  const P_HEAD = new Path2D(L.head), P_PAW = new Path2D(L.paw), P_STRANDS = new Path2D(L.strands);
  function parse(c) {
    const m = String(c).trim().match(/^#?([0-9a-f]{6})$/i);
    if (!m) return [0, 0, 0];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const heartPath = (ctx, cx, cy, s) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy + 0.9 * s);
    ctx.bezierCurveTo(cx - 1.4 * s, cy - 0.1 * s, cx - 0.9 * s, cy - 1.15 * s, cx, cy - 0.45 * s);
    ctx.bezierCurveTo(cx + 0.9 * s, cy - 1.15 * s, cx + 1.4 * s, cy - 0.1 * s, cx, cy + 0.9 * s);
    ctx.closePath();
  };
  const starPath = (ctx, cx, cy, ro, ri, n = 5, rot = -Math.PI / 2) => {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? ri : ro, a = rot + (i * Math.PI) / n;
      i ? ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)) : ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.closePath();
  };

  function build(canvas, opts = {}) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let mode = opts.mode === "smooth" ? "smooth" : "pixel";
    let oversample = opts.scale || 1;          // extra sharpness when the page zooms the cat
    let blushOn = opts.blush !== false;
    let g = null, p = 0, face = "idle", blinkV = 0, lookAt = null, cssW = 0, cssH = 0;
    let colors = { ink: "#1F1E1D", eye: "#FAF9F5", yarn: "#4A6884", yarnDark: "#2F4B63", star: "#FFC845", starMid: "#E3A21F",
                   blush: "#E88A9A", heart: "#E5566E", pupil: "#17161A", mouth: "#4A2328", shine: "#FFFFFF" };
    let rgb = {};
    const setRgb = () => { for (const k in colors) rgb[k] = parse(colors[k]); };
    setRgb();

    // Living state, updated by the ticker.
    const live = { t0: performance.now(), t: 0, look: [0, 0], dil: 0, fid: 0, fidStart: -1, nextFid: 6000 + Math.random() * 6000 };

    function resize(w, h) {
      cssW = w; cssH = h;
      if (mode === "pixel") {
        canvas.width = Math.ceil(w / PX); canvas.height = Math.ceil(h / PX);
        canvas.style.width = canvas.width * PX + "px"; canvas.style.height = canvas.height * PX + "px";
        canvas.style.imageRendering = "pixelated";
      } else {
        const ss = (window.devicePixelRatio || 1) * oversample;
        canvas.width = Math.ceil(w * ss); canvas.height = Math.ceil(h * ss);
        canvas.style.width = w + "px"; canvas.style.height = h + "px";
        canvas.style.imageRendering = "auto";
      }
      draw();
    }

    // Where the eyes should look, as a direction in the face's frame (each part -1..1).
    function lookTarget(st) {
      let target = null;
      if (st.rolling) target = [st.bx, g.ballY];
      else if (live.fid > 0) target = [g.X0 + L.ball.cx * K, g.ballY];
      else if (lookAt) target = lookAt;
      if (!target) return [0, 0];
      const ex = g.X0 + FC[0] * K, ey = g.Y0 + FC[1] * K;
      let dx = target[0] - ex, dy = target[1] - ey;
      const d = Math.hypot(dx, dy) || 1, m = Math.min(1, d / 140);
      dx = (dx / d) * m; dy = (dy / d) * m;
      return [dx * CO + dy * SI, -dx * SI + dy * CO]; // into the tilted frame
    }

    function headTransform(st) {
      // Breathing: a slow rise of the head, about every 3.4 seconds.
      const br = Math.sin((live.t / 3400) * Math.PI * 2);
      if (mode === "pixel") return { bob: br > 0.55 ? 1 : 0 };
      return { sy: 1 + 0.016 * br, sx: 1 - 0.006 * br };
    }

    // ---- pop: the cat bursts into its own pixels, which fly out and fade ----
    let popAt = null, bits = [];
    function startPop() {
      if (mode !== "pixel" || !g) return;
      draw();
      const W = canvas.width, H = canvas.height, d = ctx.getImageData(0, 0, W, H).data;
      const cx = (g.X0 + 640 * K) / PX, cy = (g.Y0 + 540 * K) / PX;
      bits = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (d[i + 3] < 128) continue;
        const a = Math.atan2(y - cy, x - cx) + (Math.random() - 0.5) * 0.9;
        const sp = 18 + Math.random() * 46;
        bits.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 22, c: `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`, life: 0.55 + Math.random() * 0.6 });
      }
      popAt = performance.now();
    }
    function drawPop() {
      const t = (performance.now() - popAt) / 1000;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const b of bits) {
        if (t > b.life) continue;
        ctx.globalAlpha = 1 - Math.max(0, (t - b.life * 0.5) / (b.life * 0.5));
        ctx.fillStyle = b.c;
        ctx.fillRect(Math.round(b.x + b.vx * t), Math.round(b.y + b.vy * t + 70 * t * t), 1, 1);
      }
      ctx.globalAlpha = 1;
    }

    function draw() {
      if (!g || !cssW) return null;
      if (popAt !== null) { drawPop(); return pose(p, g, 0); }
      const st = pose(p, g, live.fid);
      const W = canvas.width, H = canvas.height;
      const ss = mode === "pixel" ? 1 / PX : W / cssW;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.setTransform(ss * K, 0, 0, ss * K, g.X0 * ss, g.Y0 * ss);
      const [px, py, pr] = st.paw;
      const ht = headTransform(st);
      const bobPic = mode === "pixel" ? (ht.bob * PX) / K : 0;

      // Thread: held by the paw, stretched after the ball.
      const thrA = mode === "pixel" ? (st.threadAlpha > 0.5 ? 1 : 0) : st.threadAlpha;
      if (thrA > 0) {
        ctx.beginPath();
        for (let i = 0; i < TN; i++) {
          const t = TS[i], tb = Math.pow(t, 1.4);
          const x = T[2 * i] + tb * st.dImg + (1 - t) * px, y = T[2 * i + 1] + tb * st.dyImg + (1 - t) * py;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.globalAlpha = thrA;
        ctx.strokeStyle = colors.yarn;
        ctx.lineWidth = mode === "pixel" ? Math.max(L.threadW, PX / K) : L.threadW;
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // Ball.
      const ballA = mode === "pixel" ? (st.ball.alpha > 0.5 ? 1 : 0) : st.ball.alpha;
      if (ballA > 0) {
        const b = st.ball;
        ctx.globalAlpha = ballA;
        ctx.save();
        ctx.translate(b.cx, b.cy); ctx.scale(b.sx, b.sy); ctx.rotate(b.angle); ctx.translate(-L.ball.cx, -L.ball.cy);
        ctx.fillStyle = colors.yarn;
        ctx.beginPath(); ctx.arc(L.ball.cx, L.ball.cy, L.ball.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = colors.yarnDark;
        ctx.fill(P_STRANDS, "evenodd");
        ctx.restore();
        if (mode === "smooth") {
          // Soft light from the top left, so the ball reads as round.
          const rx = L.ball.r * b.sx, ry = L.ball.r * b.sy;
          ctx.save();
          ctx.beginPath(); ctx.ellipse(b.cx, b.cy, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
          let gr = ctx.createRadialGradient(b.cx - rx * 0.4, b.cy - ry * 0.45, 0, b.cx - rx * 0.4, b.cy - ry * 0.45, rx * 1.1);
          gr.addColorStop(0, "rgba(255,255,255,0.28)"); gr.addColorStop(0.6, "rgba(255,255,255,0)");
          ctx.fillStyle = gr; ctx.fillRect(b.cx - rx, b.cy - ry, rx * 2, ry * 2);
          gr = ctx.createRadialGradient(b.cx, b.cy, rx * 0.55, b.cx, b.cy, rx);
          gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,0.22)");
          ctx.fillStyle = gr; ctx.fillRect(b.cx - rx, b.cy - ry, rx * 2, ry * 2);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }
      // Head (leaning in for the swat, breathing) and face.
      ctx.save();
      ctx.translate(st.lean[0], st.lean[1] - bobPic);
      if (mode === "smooth") { ctx.translate(640, 690); ctx.scale(ht.sx, ht.sy); ctx.translate(-640, -690); }
      ctx.fillStyle = colors.ink; ctx.fill(P_HEAD, "evenodd");
      if (mode === "smooth") {
        ctx.save();
        ctx.clip(P_HEAD, "evenodd");
        const gr = ctx.createRadialGradient(585, 455, 10, 600, 500, 230);
        gr.addColorStop(0, "rgba(255,255,255,0.11)"); gr.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = gr; ctx.fillRect(480, 360, 360, 360);
        ctx.restore();
        drawSmoothFace(st);
      }
      ctx.restore();
      // Paw.
      ctx.save(); ctx.translate(px, py); ctx.translate(PAW_PIVOT[0], PAW_PIVOT[1]); ctx.rotate((pr * Math.PI) / 180); ctx.translate(-PAW_PIVOT[0], -PAW_PIVOT[1]);
      ctx.fillStyle = colors.ink; ctx.fill(P_PAW, "evenodd"); ctx.restore();
      if (mode === "smooth") drawSmoothExtra(st);

      if (mode === "pixel") drawPixelFace(st, ht.bob);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      return st;
    }

    function currentFace() {
      if (blinkV > 0.85 && (face === "idle" || face === "thinking")) return FACES.blink;
      return FACES[face] || FACES.idle;
    }

    // ---- pixel face ----
    function drawPixelFace(st, bob) {
      const W = canvas.width, H = canvas.height;
      const img = ctx.getImageData(0, 0, W, H), d = img.data;
      const pal = [rgb.ink, rgb.yarn, rgb.yarnDark];
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 110) { d[i + 3] = 0; continue; }
        let best = pal[0], bd = 1e9;
        for (const c of pal) { const e = (d[i] - c[0]) ** 2 + (d[i + 1] - c[1]) ** 2 + (d[i + 2] - c[2]) ** 2; if (e < bd) { bd = e; best = c; } }
        d[i] = best[0]; d[i + 1] = best[1]; d[i + 2] = best[2]; d[i + 3] = 255;
      }
      const toGrid = (lx, ly) => {
        const [x, y] = toPic(lx, ly);
        return [Math.round((g.X0 + (x + st.lean[0]) * K) / PX), Math.round((g.Y0 + (y + st.lean[1]) * K) / PX) - bob];
      };
      const CMAP = { l: rgb.eye, b: rgb.yarn, d: rgb.pupil, w: rgb.shine, p: rgb.blush, y: rgb.star, Y: rgb.starMid, h: rgb.heart, k: rgb.ink };
      const put = (x, y, c, a = 1) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        const col = CMAP[c], i = (y * W + x) * 4;
        d[i] = Math.round(lerp(d[i], col[0], a)); d[i + 1] = Math.round(lerp(d[i + 1], col[1], a)); d[i + 2] = Math.round(lerp(d[i + 2], col[2], a)); d[i + 3] = 255;
      };
      const f = currentFace();
      // Blush first, so the eyes sit on top of it.
      if (blushOn && f[3] > 0) {
        [SPOT.blushL, SPOT.blushR].forEach((s) => { const [x, y] = toGrid(s[0], s[1]); put(x, y, "p", 0.75 * Math.min(1, f[3] + 0.2)); put(x + 1, y, "p", 0.75 * Math.min(1, f[3] + 0.2)); });
      }
      const lx = Math.abs(live.look[0]) > 0.35 ? Math.sign(live.look[0]) : 0;
      const ly = live.look[1] > 0.45 ? 1 : live.look[1] < -0.55 ? -1 : 0;
      const eyes = [toGrid(...SPOT.eyeL), toGrid(...SPOT.eyeR)];
      const lid = face === "idle" || face === "thinking" ? (blinkV > 0.85 ? 0 : blinkV) : 0;
      eyes.forEach(([ex, ey], i) => {
        const kind = f[i];
        const pts = PIX_EYE[kind](lx, ly, lid, live.dil > 0.5, i);
        pts.forEach(([x, y, c]) => put(ex + x, ey + y, c));
      });
      const [mx, my] = toGrid(...SPOT.mouth);
      PIX_MOUTH[f[2]].forEach(([x, y, c]) => put(mx + x, my + y, c));
      const ex = PIX_EXTRA[face];
      if (ex) {
        const ax = Math.round((eyes[0][0] + eyes[1][0]) / 2), ay = Math.round((eyes[0][1] + eyes[1][1]) / 2);
        ex(Math.floor(live.t / 400)).forEach(([x, y, c]) => put(ax + x, ay + y, c));
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.putImageData(img, 0, 0);
    }

    // ---- smooth face (drawn in picture pixels, inside the head's transform) ----
    function drawSmoothFace(st) {
      const f = currentFace();
      ctx.save();
      ctx.translate(FC[0], FC[1]); ctx.rotate(TH);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      // Blush.
      if (blushOn && f[3] > 0) {
        [SPOT.blushL, SPOT.blushR].forEach(([x, y]) => {
          ctx.globalAlpha = 0.45 + 0.45 * f[3];
          ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.6);
          const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 24);
          gr.addColorStop(0, colors.blush); gr.addColorStop(0.55, colors.blush); gr.addColorStop(1, "rgba(232,138,154,0)");
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        });
        ctx.globalAlpha = 1;
      }
      [SPOT.eyeL, SPOT.eyeR].forEach(([x, y], i) => smoothEye(f[i], x, y, i));
      smoothMouth(f[2], SPOT.mouth[0], SPOT.mouth[1]);
      ctx.restore();
    }

    function smoothEye(kind, x, y, side) {
      ctx.save();
      ctx.translate(x, y);
      const light = colors.eye;
      if (kind === "open" || kind === "up") {
        const look = kind === "up" ? [0.55, -0.85] : live.look;
        let lid = face === "idle" || face === "thinking" ? blinkV : 0;
        if (kind === "up") lid = Math.max(lid, 0.3);
        if (lid > 0.85) { ctx.restore(); return smoothEye("closed", x, y, side); }
        ctx.beginPath(); ctx.ellipse(0, 0, ER, ER * 1.06, 0, 0, Math.PI * 2);
        ctx.fillStyle = light; ctx.fill();
        ctx.save(); ctx.clip();
        const ix = look[0] * 10, iy = look[1] * 9;
        const ir = 24 + live.dil * 2.5, pr = 13.5 + live.dil * 5.5;
        const gr = ctx.createLinearGradient(0, iy - ir, 0, iy + ir);
        gr.addColorStop(0, colors.yarnDark); gr.addColorStop(1, colors.yarn);
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(ix, iy, ir, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = colors.pupil; ctx.beginPath(); ctx.arc(ix * 1.08, iy * 1.08, pr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = colors.shine;
        ctx.beginPath(); ctx.ellipse(ix - 9, iy - 10, 7.5, 8.5, -0.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ix + 9, iy + 9, 3.6, 0, Math.PI * 2); ctx.fill();
        // A soft shadow under the upper lid, and the lid itself when blinking.
        let sh = ctx.createLinearGradient(0, -ER, 0, -ER + 16);
        sh.addColorStop(0, "rgba(0,0,0,0.28)"); sh.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = sh; ctx.fillRect(-ER, -ER * 1.1, ER * 2, 20);
        if (lid > 0) { ctx.fillStyle = colors.ink; ctx.fillRect(-ER - 2, -ER * 1.1, ER * 2 + 4, ER * 2.2 * lid); }
        ctx.restore();
      } else if (kind === "happy") {
        ctx.strokeStyle = light; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(-22, 8); ctx.quadraticCurveTo(0, -24, 22, 8); ctx.stroke();
      } else if (kind === "closed") {
        ctx.strokeStyle = light; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(-22, 0); ctx.quadraticCurveTo(0, 18, 22, 0); ctx.stroke();
      } else if (kind === "shut") {
        // Squeezed shut, the moment before the stars: > <
        ctx.strokeStyle = light; ctx.lineWidth = 7;
        const s = side ? -1 : 1;
        ctx.beginPath(); ctx.moveTo(-14 * s, -14); ctx.lineTo(14 * s, 0); ctx.lineTo(-14 * s, 14); ctx.stroke();
      } else if (kind === "round") {
        ctx.fillStyle = light; ctx.beginPath(); ctx.arc(0, 0, ER * 1.05, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = colors.pupil; ctx.beginPath(); ctx.arc(0, 2, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = colors.shine; ctx.beginPath(); ctx.arc(-3, -2, 3, 0, Math.PI * 2); ctx.fill();
      } else if (kind === "star") {
        const pulse = 1 + 0.08 * Math.sin(live.t / 160);
        ctx.rotate(-TH * 0.5);
        starPath(ctx, 0, 0, 36 * pulse, 16 * pulse);
        ctx.fillStyle = colors.star; ctx.strokeStyle = colors.star; ctx.lineWidth = 6;
        ctx.fill(); ctx.stroke();
        starPath(ctx, 0, 2, 16 * pulse, 7 * pulse);
        ctx.fillStyle = colors.starMid; ctx.fill();
        ctx.fillStyle = colors.shine; ctx.beginPath(); ctx.arc(-9, -9, 4.5, 0, Math.PI * 2); ctx.fill();
      } else if (kind === "heart") {
        const pulse = 1 + 0.1 * Math.max(0, Math.sin(live.t / 140));
        ctx.rotate(-TH);
        heartPath(ctx, 0, 2, 26 * pulse);
        ctx.fillStyle = colors.heart; ctx.fill();
        ctx.fillStyle = colors.shine; ctx.beginPath(); ctx.ellipse(-11, -10, 6, 4.5, -0.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    function smoothMouth(kind, x, y) {
      ctx.save();
      ctx.translate(x, y); ctx.scale(1.15, 1.15);
      const light = colors.eye;
      ctx.strokeStyle = light; ctx.lineWidth = 5;
      const philtrum = () => { ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, -1); ctx.stroke(); };
      const inside = (path, tongueY, tongueR) => {
        path(); ctx.fillStyle = colors.mouth; ctx.fill();
        ctx.save(); path(); ctx.clip();
        ctx.fillStyle = colors.blush; ctx.beginPath(); ctx.ellipse(0, tongueY, tongueR, tongueR * 0.75, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        path(); ctx.lineWidth = 4.5; ctx.stroke();
      };
      if (kind === "w" || kind === "small") {
        const s = kind === "small" ? 0.6 : 1;
        philtrum();
        ctx.beginPath(); ctx.moveTo(-15 * s, -3 * s); ctx.quadraticCurveTo(-7.5 * s, 10 * s, 0, -1); ctx.quadraticCurveTo(7.5 * s, 10 * s, 15 * s, -3 * s); ctx.stroke();
      } else if (kind === "tongue") {
        philtrum();
        ctx.fillStyle = colors.blush;
        ctx.beginPath(); ctx.moveTo(-5, 2); ctx.lineTo(5, 2); ctx.arc(0, 4, 5.5, 0, Math.PI); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-15, -3); ctx.quadraticCurveTo(-7.5, 10, 0, -1); ctx.quadraticCurveTo(7.5, 10, 15, -3); ctx.stroke();
      } else if (kind === "open") {
        philtrum();
        inside(() => { ctx.beginPath(); ctx.moveTo(-14, -2); ctx.quadraticCurveTo(0, 30, 14, -2); ctx.quadraticCurveTo(0, 3, -14, -2); ctx.closePath(); }, 12, 7);
      } else if (kind === "wide") {
        inside(() => { ctx.beginPath(); ctx.moveTo(-20, -4); ctx.quadraticCurveTo(0, 40, 20, -4); ctx.quadraticCurveTo(0, 0, -20, -4); ctx.closePath(); }, 16, 9);
      } else if (kind === "o") {
        inside(() => { ctx.beginPath(); ctx.ellipse(0, 6, 7, 9, 0, 0, Math.PI * 2); }, 12, 4);
      } else if (kind === "hmm") {
        ctx.beginPath(); ctx.moveTo(-11, 4); ctx.quadraticCurveTo(-5, -1, 0, 4); ctx.quadraticCurveTo(5, 9, 11, 3); ctx.stroke();
      }
      ctx.restore();
    }

    // Extras float above the head, upright (not tilted with the head).
    function drawSmoothExtra(st) {
      const t = live.t;
      const A = [FC[0] + st.lean[0] + 20, FC[1] + st.lean[1] - 120];
      ctx.save();
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      const sparkle = (x, y, r, a = 1) => {
        ctx.globalAlpha = a;
        ctx.fillStyle = colors.star;
        ctx.beginPath();
        ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
        ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
        ctx.globalAlpha = 1;
      };
      if (face === "star" || face === "happy" || face === "wink") {
        const n = face === "star" ? 3 : 1;
        const spots = [[110, 30, 26], [-110, 40, 20], [60, -40, 16]];
        for (let i = 0; i < n; i++) {
          const ph = (t / 900 + i * 0.37) % 1, s = Math.sin(Math.PI * ph);
          sparkle(A[0] + spots[i][0], A[1] + spots[i][1], spots[i][2] * (0.4 + 0.8 * s), 0.3 + 0.7 * s);
        }
      } else if (face === "thinking") {
        ctx.fillStyle = colors.ink;
        const k = Math.floor(t / 400) % 4;
        [[90, 30, 8], [118, -6, 12], [158, -50, 17]].forEach(([x, y, r], i) => {
          if (k > i) { ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(A[0] + x, A[1] + y, r, 0, Math.PI * 2); ctx.fill(); }
        });
      } else if (face === "surprised") {
        const j = Math.sin(t / 60) * 2;
        ctx.fillStyle = colors.ink;
        ctx.beginPath(); ctx.roundRect(A[0] + 128 + j, A[1] - 40, 13, 44, 6); ctx.fill();
        ctx.beginPath(); ctx.arc(A[0] + 134 + j, A[1] + 20, 7.5, 0, Math.PI * 2); ctx.fill();
      } else if (face === "sleepy") {
        ctx.strokeStyle = colors.ink; ctx.lineWidth = 6;
        for (let i = 0; i < 3; i++) {
          const ph = ((t / 2600) + i / 3) % 1, s = 10 + 12 * ph;
          const x = A[0] + 100 + 50 * ph, y = A[1] + 30 - 110 * ph;
          ctx.globalAlpha = Math.sin(Math.PI * ph);
          ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.lineTo(x + s, y + s); ctx.stroke();
        }
      } else if (face === "love") {
        for (let i = 0; i < 3; i++) {
          const ph = ((t / 1800) + i / 3) % 1;
          ctx.globalAlpha = Math.sin(Math.PI * ph);
          heartPath(ctx, A[0] + 90 + 30 * Math.sin(ph * 6 + i), A[1] + 40 - 120 * ph, 12 + 6 * ph);
          ctx.fillStyle = colors.heart; ctx.fill();
        }
      }
      ctx.restore();
    }

    // ---- the ticker: breathing, smooth eyes, idle paw tap, animated extras ----
    let raf = 0, lastDraw = 0;
    function tick(now) {
      raf = requestAnimationFrame(tick);
      if (document.hidden || !g) return;
      if (now - lastDraw < (mode === "pixel" && popAt === null ? 66 : 33)) return; // about 15 or 30 frames a second
      lastDraw = now;
      live.t = now - live.t0;
      const st = pose(p, g, live.fid);
      const tl = lookTarget(st);
      const k = mode === "pixel" ? 1 : 0.22;
      live.look[0] = lerp(live.look[0], tl[0], k); live.look[1] = lerp(live.look[1], tl[1], k);
      // Pupils grow when the mouse comes close: the cat is interested.
      let near = 0;
      if (lookAt) near = Math.hypot(lookAt[0] - g.headX, lookAt[1] - g.headY) < 120 ? 1 : 0;
      live.dil = lerp(live.dil, near, mode === "pixel" ? 1 : 0.12);
      // Now and then, while resting, the paw bats the ball.
      if (p === 0 && face === "idle") {
        if (live.fidStart < 0 && live.t > live.nextFid) live.fidStart = live.t;
        if (live.fidStart >= 0) {
          live.fid = clamp((live.t - live.fidStart) / 900);
          if (live.fid >= 1) { live.fid = 0; live.fidStart = -1; live.nextFid = live.t + 8000 + Math.random() * 9000; }
        }
      } else { live.fid = 0; live.fidStart = -1; }
      draw();
    }
    raf = requestAnimationFrame(tick);

    function setFace(name) { face = FACES[name] ? name : "idle"; draw(); }

    // Short acted moments, like the merge: eyes squeeze shut, mouth opens, then star eyes.
    let reactTimers = [];
    function react(name, after) {
      reactTimers.forEach(clearTimeout); reactTimers = [];
      const steps = {
        merge: [["gasp", 0], ["star", 320], [after || "idle", 2600]],
        copied: [["wink", 0], [after || "idle", 1400]],
        shared: [["love", 0], [after || "idle", 2000]],
        sharedlong: [["love", 0], [after || "idle", 4300]],
        oops: [["surprised", 0], [after || "idle", 2200]],
        hello: [["happy", 0], [after || "idle", 1500]],
      }[name] || [[name, 0]];
      steps.forEach(([f, t]) => reactTimers.push(setTimeout(() => setFace(f), t)));
    }

    return {
      resize,
      pop: startPop,
      unpop() { popAt = null; bits = []; draw(); },
      render(p2, g2) { p = p2; g = g2; return draw(); },
      look(pt) { lookAt = pt; },
      blink(v) { blinkV = v; draw(); },
      face: setFace,
      react,
      setColors(c) { colors = Object.assign({}, colors, c); setRgb(); draw(); },
      setMode(m) { mode = m === "smooth" ? "smooth" : "pixel"; if (cssW) resize(cssW, cssH); },
      setBlush(v) { blushOn = !!v; draw(); },
      tap() { if (p === 0) { live.fidStart = live.t; } },
      pose: (p2, g2) => pose(p2, g2),
      destroy() { cancelAnimationFrame(raf); reactTimers.forEach(clearTimeout); },
    };
  }

  // Calls onFrame(v) with v going 0 -> 1 -> 0 over about 180ms, every few seconds.
  function startBlinking(onFrame) {
    let timer = null;
    function once() {
      const t0 = performance.now();
      (function step(now) {
        const t = (now - t0) / 180;
        onFrame(t >= 1 ? 0 : Math.sin(Math.PI * t));
        if (t < 1) requestAnimationFrame(step);
      })(t0);
      timer = setTimeout(once, Math.random() < 0.2 ? 280 : 2800 + Math.random() * 3600);
    }
    timer = setTimeout(once, 1500 + Math.random() * 2000);
    return () => clearTimeout(timer);
  }

  CatExt.roll = { build, geometry, startBlinking, DURATION, BAR_H, setPx, pickPx, size, FACES: Object.keys(FACES) };
})();
