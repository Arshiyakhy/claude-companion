// CAT ANIMATION: draws the cat, the yarn ball and the command card into an SVG,
// for any point p of the timeline between 0 (cat resting) and 1 (menu open).
//
//   0.00 to 0.46  the cat turns over, then reshapes onto its back; the ball rides to its paws
//   0.40 to 0.60  the paws crouch with the ball, then push it up
//   0.52 to 0.74  the ball flies to the menu spot while the cat fades
//   0.72 to 1.00  the ball opens, the card grows out of it, the commands come out
// The phases overlap, so the motion flows from one into the next.
//
// Colors come from CSS variables set by theme.js, so the drawing follows the
// person's Claude theme: currentColor is the ink, --c-bg the card background.
(function () {
  const CatExt = (window.CatExt = window.CatExt || {});
  const D = CatExt.animData;
  const NS = "http://www.w3.org/2000/svg";

  // Widget box is 220 x 340. The cat sits in the bottom right corner.
  const SIZE = { w: 220, h: 340 };
  const K = 0.6, TX = 145.2, TY = 245;
  const CARD = { x: 16, y: 40, w: 200, h: 254, r: 18 };
  const CC = { x: CARD.x + CARD.w / 2, y: CARD.y + CARD.h / 2 };
  const PILL_Y = [108, 158, 208, 258];

  const clamp = (x) => Math.min(1, Math.max(0, x));
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const outCubic = (x) => { x = clamp(x); return 1 - Math.pow(1 - x, 3); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const W = (x, y) => [TX + K * x, TY + K * y];
  const B1 = W(D.b1.x, D.b1.y), B2 = W(D.bc[0], D.bc[1]);

  function polyD(arr, n) {
    n = n === undefined ? arr.length / 2 : n;
    let s = "M" + arr[0] + " " + arr[1];
    for (let i = 1; i < n; i++) s += "L" + arr[2 * i] + " " + arr[2 * i + 1];
    return s;
  }
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const STROKE = { fill: "none", stroke: "currentColor", "stroke-width": 2.8, "stroke-linecap": "round", "stroke-linejoin": "round" };

  // Points of a matched stroke at morph amount u. Each point turns around the
  // body's center, which is what makes the change look like a roll.
  // rot: how far the whole cat has turned. s: how far it has reshaped.
  function morph(pr, rot, s, paw) {
    const n = pr.rp.length, out = new Array(2 * n);
    for (let i = 0; i < n; i++) {
      const r = lerp(pr.rp[i], pr.rq[i], s), th = pr.tp[i] + rot + (pr.d[i] - R) * s;
      out[2 * i] = (D.C[0] + r * Math.cos(th)).toFixed(1);
      out[2 * i + 1] = (D.C[1] + r * Math.sin(th) + (pr.w ? pr.w[i] * paw * s : 0)).toFixed(1);
    }
    return out;
  }

  // ---------- timing ----------
  const R = D.R; // how far the cat turns to land on its back (180 degrees, clockwise)
  const rollU = (p) => { const x = clamp(p / 0.46); return 0.5 - 0.5 * Math.cos(Math.PI * x); };
  // A soft bump that rises from a to a peak at b and settles back by c.
  function bump(p, a, b, c) {
    if (p <= a || p >= c) return 0;
    return p < b ? ease((p - a) / (b - a)) : 1 - ease((p - b) / (c - b));
  }
  // Paws: crouch a little with the ball, then push up, then relax.
  const PAW = [[0.4, 0], [0.51, 3], [0.585, -9], [0.68, 0]];
  function pawAt(p) {
    for (let i = 0; i < PAW.length - 1; i++) {
      const [p0, v0] = PAW[i], [p1, v1] = PAW[i + 1];
      if (p >= p0 && p <= p1) return lerp(v0, v1, ease((p - p0) / (p1 - p0)));
    }
    return 0;
  }
  // Ball keys: [p, x, y, spin, scale]. A Catmull-Rom curve runs through them,
  // so the ball never stops dead between phases.
  let BALL = null;
  function ballKeys() {
    return [
      [0.4, B2[0], B2[1] + 1, -190, 1],
      [0.46, B2[0], B2[1], -200, 1],
      [0.52, B2[0], B2[1] + 3, -210, 1],
      [0.62, lerp(B2[0], CC.x, 0.6), lerp(B2[1], CC.y, 0.75) - 14, 60, 1],
      [0.74, CC.x, CC.y, 340, 1],
    ];
  }
  // During the roll the ball is held in the curl, so it turns with the cat
  // and then moves to the paws as the cat reshapes.
  const CW = W(D.C[0], D.C[1]);
  const b1r = Math.hypot(B1[0] - CW[0], B1[1] - CW[1]), b1a = Math.atan2(B1[1] - CW[1], B1[0] - CW[0]);
  const b2r = Math.hypot(B2[0] - CW[0], B2[1] - CW[1]), b2a = Math.atan2(B2[1] - CW[1], B2[0] - CW[0]);
  let bDelta = b2a - b1a - R;
  bDelta = Math.atan2(Math.sin(bDelta), Math.cos(bDelta)) + R;
  function ballRoll(ur, s) {
    const r = lerp(b1r, b2r, s), a = b1a + R * ur + (bDelta - R) * s;
    return [CW[0] + r * Math.cos(a), CW[1] + r * Math.sin(a), -200 * ur, lerp(D.b1.s, 1, s)];
  }
  // Bar mode: the paws toss the ball up, it arcs over and lands at the target.
  function tossKeys(T) {
    const apexY = Math.min(B2[1], T.y) - 95;
    return [
      [0.4, B2[0], B2[1] + 1, -190, 1],
      [0.46, B2[0], B2[1], -200, 1],
      [0.52, B2[0], B2[1] + 3, -210, 1],
      [0.6, B2[0] - 20, B2[1] - 70, 20, 1],
      [0.68, lerp(B2[0], T.x, 0.55), apexY, 220, 1],
      [0.76, T.x, T.y, 420, 1],
    ];
  }
  function ballAt(p, target) {
    const K_ = target ? tossKeys(target) : (BALL = BALL || ballKeys()), last = K_.length - 1;
    if (p <= 0) return K_[0].slice(1);
    if (p >= K_[last][0]) return K_[last].slice(1);
    let i = 0;
    while (p > K_[i + 1][0]) i++;
    const t = (p - K_[i][0]) / (K_[i + 1][0] - K_[i][0]);
    const a = K_[Math.max(0, i - 1)], b = K_[i], c = K_[i + 1], d = K_[Math.min(last, i + 2)];
    const out = [];
    for (let j = 1; j < 5; j++) {
      const P0 = a[j], P1 = b[j], P2 = c[j], P3 = d[j];
      out.push(0.5 * (2 * P1 + (-P0 + P2) * t + (2 * P0 - 5 * P1 + 4 * P2 - P3) * t * t + (-P0 + 3 * P1 - 3 * P2 + P3) * t * t * t));
    }
    return out;
  }

  // commands: [{ name, enabled }] in menu order, top first (card mode only).
  // opts.mode: "card" (the ball opens into a card of commands) or "bar" (the ball
  // lands at opts.target, an {x, y} the caller can change, and opens there).
  function build(svg, commands, opts) {
    opts = opts || {};
    const barMode = opts.mode === "bar";
    if (barMode) commands = [];
    const cat = el("g", {}, svg);
    const catInner = el("g", { transform: `translate(${TX} ${TY}) scale(${K})` }, cat);
    const pairPaths = D.pairs.map(() => el("path", STROKE, catInner));
    const fadePaths = D.fade1.map((a) => el("path", Object.assign({ d: polyD(a) }, STROKE), catInner));
    const ball1 = el("g", {}, catInner);
    D.ball1.forEach((a) => el("path", Object.assign({ d: polyD(a) }, STROKE), ball1));
    const growPaths = D.grow2.map(() => el("path", STROKE, catInner));

    const card = barMode ? null : el("rect", { fill: "var(--c-bg)", stroke: "var(--c-border-strong)", "stroke-width": 1.2 }, svg);
    if (card) card.style.filter = "drop-shadow(0 6px 16px var(--c-shadow))";
    const head = barMode ? null : el("text", { x: CARD.x + 16, y: CARD.y + 30, "font-size": 13, "font-weight": 600, fill: "var(--c-muted)" }, svg);
    if (head) head.textContent = "What do you want to do?";

    const pills = commands.map((cmd, i) => {
      const primary = i === 0;
      const g = el("g", {}, svg);
      const body = el("g", { opacity: cmd.enabled ? 1 : 0.45 }, g);
      el("rect", { x: -88, y: -22, width: 176, height: 44, rx: 22, fill: primary ? "currentColor" : "var(--c-bg)", stroke: "currentColor", "stroke-width": 1.4 }, body);
      const ic = el("g", { transform: `translate(-66 0) scale(0.3) translate(${-D.bc[0]} ${-D.bc[1]})` }, body);
      D.ball2.forEach((s) => el("path", Object.assign({ d: polyD(s.p) }, STROKE, { stroke: primary ? "var(--c-bg)" : "currentColor", "stroke-width": 4.5 }), ic));
      const t = el("text", { x: -46, y: 5, "font-size": 15, "font-weight": 650, fill: primary ? "var(--c-bg)" : "currentColor" }, body);
      t.textContent = cmd.name;
      if (!cmd.enabled) {
        const soon = el("text", { x: 78, y: 4, "font-size": 11, "text-anchor": "end", fill: "currentColor" }, body);
        soon.textContent = "soon";
      }
      return g;
    });

    const ball = el("g", {}, svg);
    const strands = D.ball2.map((s, i) => {
      const g = el("g", {}, ball);
      el("path", Object.assign({ d: polyD(s.p) }, STROKE), g);
      return { g, s, i };
    });

    return function render(p) {
      // 1. roll. The cat first turns as a whole and keeps its shape, then
      // reshapes into the on-its-back pose near the end of the turn.
      const ur = rollU(p);
      const rot = R * ur;
      const sBody = ease((ur - 0.35) / 0.6), sTail = ease((ur - 0.5) / 0.5);
      const paw = pawAt(p);
      pairPaths.forEach((path, i) => path.setAttribute("d", polyD(morph(D.pairs[i], rot, i === 0 ? sBody : sTail, paw))));
      const fo = 1 - ease(p / 0.04);
      fadePaths.forEach((path) => path.setAttribute("opacity", fo));
      ball1.setAttribute("opacity", fo);
      const g = ease((ur - 0.72) / 0.28);
      growPaths.forEach((path, i) => {
        const a = D.grow2[i], n = Math.floor((a.length / 2) * g);
        path.setAttribute("d", n < 8 ? "" : polyD(a, n));
      });
      // 3. the cat disappears while the ball flies
      const cf = ease((p - 0.56) / 0.17);
      const [bx0, by0] = W(63, 150);
      cat.setAttribute("opacity", 1 - cf);
      cat.setAttribute("transform", `translate(${bx0} ${by0}) scale(${1 - 0.2 * cf}) translate(${-bx0} ${-by0})`);

      // the ball follows one smooth curve through its key positions
      const k = p < 0.46 ? ballRoll(ur, sBody) : ballAt(p, barMode ? opts.target : null);
      let bx = k[0], by = k[1], sp = k[2], sc = k[3];
      const dip = bump(p, 0.44, 0.51, 0.56), st = bump(p, 0.54, 0.6, 0.7);
      let sx = (1 + 0.08 * dip) * (1 - 0.08 * st), sy = (1 - 0.1 * dip) * (1 + 0.14 * st);
      // 4. the ball opens
      const o = barMode ? ease((p - 0.76) / 0.18) : ease((p - 0.72) / 0.24);
      sc *= 1 + (barMode ? 0.5 : 0.9) * o; sp += 90 * o;
      ball.setAttribute("opacity", ease(p / 0.06));
      ball.setAttribute("transform", `translate(${bx.toFixed(2)} ${by.toFixed(2)}) rotate(${sp.toFixed(1)}) scale(${(K * sc * sx).toFixed(3)} ${(K * sc * sy).toFixed(3)}) translate(${-D.bc[0]} ${-D.bc[1]})`);
      strands.forEach(({ g, s, i }) => {
        if (o <= 0) { g.removeAttribute("transform"); g.setAttribute("opacity", 1); return; }
        const sign = i % 2 ? 1 : -1;
        const len = Math.hypot(s.mx, s.my) || 1;
        const out = (s.outline ? 10 : 18) * o;
        const ang = sign * (s.outline ? 40 : 60 + 15 * (i % 4)) * o;
        const cx = D.bc[0] + s.mx, cy = D.bc[1] + s.my;
        g.setAttribute("transform", `translate(${(s.mx / len * out).toFixed(2)} ${(s.my / len * out).toFixed(2)}) rotate(${ang.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})`);
        g.setAttribute("opacity", (1 - clamp(o * (s.outline ? 1.8 : 1.6))).toFixed(3));
      });
      if (barMode) return;
      // the card grows out of the ball
      const c = ease((p - 0.76) / 0.16);
      const r0 = 18 * K * 1.9;
      if (c <= 0) card.setAttribute("opacity", 0);
      else {
        card.setAttribute("opacity", clamp(c * 3));
        card.setAttribute("x", lerp(CC.x - r0, CARD.x, c)); card.setAttribute("y", lerp(CC.y - r0, CARD.y, c));
        card.setAttribute("width", lerp(2 * r0, CARD.w, c)); card.setAttribute("height", lerp(2 * r0, CARD.h, c));
        card.setAttribute("rx", lerp(r0, CARD.r, c));
      }
      head.setAttribute("opacity", ease((p - 0.88) / 0.1));
      // the commands come out of the ball, one after another
      pills.forEach((gp, i) => {
        const q = ease((p - (0.8 + 0.035 * i)) / 0.095);
        const tx = lerp(CC.x, CARD.x + CARD.w / 2, q), ty = lerp(CC.y, PILL_Y[i], q);
        gp.setAttribute("opacity", clamp(q * 2.5));
        gp.setAttribute("transform", `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${lerp(0.2, 1, q).toFixed(3)})`);
      });
    };
  }

  // A small yarn ball icon, for the chat header.
  function ballIcon(size) {
    const svg = el("svg", { viewBox: `${D.bc[0] - D.br - 2} ${D.bc[1] - D.br - 2} ${2 * D.br + 4} ${2 * D.br + 4}`, width: size, height: size, "aria-hidden": "true" });
    D.ball2.forEach((s) => el("path", Object.assign({ d: polyD(s.p) }, STROKE, { "stroke-width": 4 }), svg));
    return svg;
  }

  // How long the whole thing takes, in seconds.
  const DURATION = { open: 2.4, close: 1.1 };

  CatExt.anim = { build, ballIcon, SIZE, CARD, PILL_Y, DURATION };
})();
