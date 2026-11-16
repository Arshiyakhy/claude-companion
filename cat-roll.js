// CAT ROLL: the cat swats its yarn ball to the left, and the chat bar unrolls
// behind the ball. The bar is made of the ball's yarn, so the ball shrinks as
// it rolls and is used up when the bar is fully open.
//
// p is the timeline, from 0 (cat resting with its ball) to 1 (bar fully open):
//   0.00 to 0.06  the paw lifts back, winding up (anticipation)
//   0.06 to 0.12  the paw swats the ball, and the ball squashes on impact
//   0.12 to 0.96  the ball rolls left and unwinds into the bar
//   0.12 to 0.40  the paw swings through a little and settles (follow-through)
//   0.40 to 0.85  the stretched thread fades away
// Running p backwards closes it: the yarn winds back into a ball that rolls home.
//
// Between animations the cat stays alive: it blinks now and then, and its eyes
// follow the ball while it rolls, then follow your mouse.
(function () {
  const CatExt = (window.CatExt = window.CatExt || {});
  const L = CatExt.logo;
  const NS = "http://www.w3.org/2000/svg";

  const K = 20 / L.ball.r;           // scale: the ball's radius is 20px on screen
  const BAR_H = 56, CAT_W = 72;      // bar height, space the cat takes on the right
  const EYE_SCALE = 1.25;            // bigger eyes read as cuter (the "baby schema")
  // First open of a page plays the whole show; later opens are quicker, and
  // closing is quicker still, so the cat never feels slow to use.
  const DURATION = { open: 1.7, reopen: 1.0, close: 0.6 };

  const clamp = (x) => Math.min(1, Math.max(0, x));
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const rollEase = (x) => { x = clamp(x); return 1 - Math.pow(1 - x, 2.4); };
  // A soft bump: rises from a to a peak at b, back to 0 by c.
  const bump = (p, a, b, c) => (p <= a || p >= c ? 0 : p < b ? ease((p - a) / (b - a)) : 1 - ease((p - b) / (c - b)));

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // Where everything sits, for a host box of width w and height h.
  // The bar spans [barL, barR] along the bottom, the cat sits to its right.
  function geometry(w, h) {
    const X0 = w - 6 - 806 * K;               // right ear 6px from the right edge
    const Y0 = h - BAR_H / 2 - L.ball.cy * K; // ball centered on the bar's middle line
    const barR = w - CAT_W, barL = 0;
    const restX = X0 + L.ball.cx * K;
    const ballY = h - BAR_H / 2;
    return { w, h, X0, Y0, barL, barR, barW: barR - barL, restX, endX: barL, ballY };
  }

  // Thread: arc length along it, 0 at the paw and 1 at the ball.
  const T = L.thread, TN = T.length / 2, TS = new Array(TN);
  (function () {
    let acc = 0; TS[0] = 0;
    for (let i = 1; i < TN; i++) {
      acc += Math.hypot(T[2 * i] - T[2 * i - 2], T[2 * i + 1] - T[2 * i - 1]);
      TS[i] = acc;
    }
    for (let i = 0; i < TN; i++) TS[i] /= acc;
  })();
  const PAW_PIVOT = [T[0], T[1]];

  // Paw keys: [p, dx, dy, rotation], in picture pixels. Wind up, swat, swing
  // through a little past rest, settle.
  const PAW = [[0, 0, 0, 0], [0.06, 18, -26, 14], [0.12, -22, 26, -16], [0.26, 7, -8, 5], [0.4, 0, 0, 0]];
  function pawAt(p) {
    for (let i = 0; i < PAW.length - 1; i++) {
      const a = PAW[i], b = PAW[i + 1];
      if (p >= a[0] && p <= b[0]) {
        const t = ease((p - a[0]) / (b[0] - a[0]));
        return [lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
      }
    }
    return [0, 0, 0];
  }

  function ballX(g, p) {
    return lerp(g.restX, g.endX, rollEase((p - 0.12) / 0.84));
  }
  // How much yarn is left: the ball's area shrinks in step with the distance
  // rolled, so its radius goes with the square root. 1 = full ball, 0 = gone.
  function yarnLeft(g, bx) {
    const t = clamp((g.restX - bx) / (g.restX - g.endX));
    return Math.sqrt(1 - t);
  }

  function build(svg) {
    const root = el("g", {}, svg);
    const thread = el("path", { fill: "none", stroke: "var(--c-yarn)", "stroke-width": L.threadW, "stroke-linecap": "round", "stroke-linejoin": "round" }, root);
    const ball = el("g", {}, root);
    el("circle", { cx: L.ball.cx, cy: L.ball.cy, r: L.ball.r, fill: "var(--c-yarn)" }, ball);
    el("path", { d: L.strands, fill: "var(--c-yarn-dark)", "fill-rule": "evenodd" }, ball);
    const headG = el("g", {}, root);
    el("path", { d: L.head, fill: "var(--c-ink)", "fill-rule": "evenodd" }, headG);
    const eyes = L.eyes.map((e) => {
      const g = el("g", {}, headG);
      el("path", { d: e.white, fill: "var(--c-eye)" }, g);
      const pupil = el("path", { d: e.pupil, fill: "var(--c-ink)" }, g);
      return { e, g, pupil };
    });
    const paw = el("path", { d: L.paw, fill: "var(--c-ink)", "fill-rule": "evenodd" }, root);

    let geom = null, lookAt = null, blink = 0, rolling = false, ballPos = null, lean = [0, 0];

    // Eyes: blink squashes them shut; pupils slide toward what the cat looks at.
    function drawEyes() {
      const target = rolling && ballPos ? ballPos : lookAt;
      eyes.forEach(({ e, g, pupil }) => {
        g.setAttribute("transform", `translate(${e.cx} ${e.cy}) scale(${EYE_SCALE} ${(EYE_SCALE * (1 - 0.9 * blink)).toFixed(3)}) translate(${-e.cx} ${-e.cy})`);
        let dx = -3, dy = 1; // resting look: a little toward the bar
        if (target && geom) {
          const ix = (target[0] - geom.X0) / K - lean[0], iy = (target[1] - geom.Y0) / K - lean[1];
          const vx = ix - e.cx, vy = iy - e.cy, d = Math.hypot(vx, vy) || 1;
          const reach = Math.min(1, d / 140);
          dx = (vx / d) * e.rx * 0.32 * reach;
          dy = (vy / d) * e.ry * 0.28 * reach;
        }
        pupil.setAttribute("transform", `translate(${dx.toFixed(1)} ${dy.toFixed(1)})`);
      });
    }

    // Draws frame p.
    function render(p, g) {
      geom = g;
      root.setAttribute("transform", `translate(${g.X0.toFixed(2)} ${g.Y0.toFixed(2)}) scale(${K.toFixed(5)})`);
      const bx = ballX(g, p);
      const s = yarnLeft(g, bx);
      const r = L.ball.r * s;                                // radius now, in picture pixels
      const dImg = (bx - g.restX) / K;                       // ball travel in picture pixels
      const dyImg = L.ball.r - r;                            // it keeps sitting on the ground
      // A rolling ball turns by distance / radius. With the radius shrinking as
      // sqrt(1 - t), that adds up to 2 * (1 - sqrt(1 - t)) * distance / radius.
      const D = (g.restX - g.endX) / K;
      const angle = (-2 * (1 - s) * D / L.ball.r) * (180 / Math.PI);
      // Squash on impact: wider and flatter, keeping its volume, then back.
      const hit = bump(p, 0.1, 0.13, 0.22);
      const sx = s * (1 + 0.12 * hit), sy = s * (1 - 0.1 * hit);
      const cx = L.ball.cx + dImg, cy = L.ball.cy + dyImg + L.ball.r * 0.1 * hit;
      const fade = ease((s - 0.04) / 0.16);                  // the last bit of yarn fades
      if (fade <= 0) ball.setAttribute("opacity", 0);
      else {
        ball.setAttribute("opacity", fade.toFixed(3));
        ball.setAttribute("transform", `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) rotate(${angle.toFixed(1)}) translate(${-L.ball.cx} ${-L.ball.cy})`);
      }

      const [px, py, pr] = pawAt(p);
      paw.setAttribute("transform", `translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${pr.toFixed(1)} ${PAW_PIVOT[0]} ${PAW_PIVOT[1]})`);
      // The head leans in for the swat and settles back a beat after the paw.
      const l = Math.sin(Math.PI * clamp(p / 0.4));
      lean = [-8 * l, 4 * l];
      headG.setAttribute("transform", `translate(${lean[0].toFixed(1)} ${lean[1].toFixed(1)})`);

      // The thread stays held by the paw and stretches after the ball.
      let d = "";
      for (let i = 0; i < TN; i++) {
        const t = TS[i], tb = Math.pow(t, 1.4);
        const x = T[2 * i] + tb * dImg + (1 - t) * px;
        const y = T[2 * i + 1] + tb * dyImg + (1 - t) * py;
        d += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
      }
      thread.setAttribute("d", d);
      thread.setAttribute("opacity", (1 - ease((p - 0.4) / 0.45)).toFixed(3));

      // While the ball is moving, the cat watches it.
      rolling = p > 0.04 && p < 0.97;
      ballPos = [bx, g.ballY];
      drawEyes();

      return { bx, cut: p >= 0.999 ? 0 : Math.max(0, bx - g.barL) };
    }

    return {
      render,
      // Where the cat should look when the ball is not rolling, in host pixels (or null).
      look(pt) { lookAt = pt; drawEyes(); },
      // 0 = eyes open, 1 = shut.
      blink(v) { blink = v; drawEyes(); },
    };
  }

  // Calls onFrame(v) with v going 0 -> 1 -> 0 over about 160ms, every few seconds.
  function startBlinking(onFrame) {
    let timer = null;
    function once() {
      const t0 = performance.now();
      (function step(now) {
        const t = (now - t0) / 160;
        onFrame(t >= 1 ? 0 : Math.sin(Math.PI * t));
        if (t < 1) requestAnimationFrame(step);
      })(t0);
      // Sometimes a quick double blink, like a real cat.
      const next = Math.random() < 0.2 ? 260 : 2800 + Math.random() * 3600;
      timer = setTimeout(once, next);
    }
    timer = setTimeout(once, 1500 + Math.random() * 2000);
    return () => clearTimeout(timer);
  }

  CatExt.roll = { build, geometry, ballX, startBlinking, DURATION, BAR_H, CAT_W };
})();
