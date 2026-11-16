// THEME: reads the colors and font the Claude page is using right now, and
// turns them into a small palette for the cat, the menu and the side chat.
// It reads the page's real computed colors instead of guessing class names,
// so it keeps working in light, dark and any future theme, and it updates
// live when the person switches theme.
(function () {
  const CatExt = (window.CatExt = window.CatExt || {});

  function parse(c) {
    const m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const v = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 };
  }
  const hex = (c) => "#" + [c.r, c.g, c.b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, t) => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, a: 1 });
  function lum(c) {
    const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }

  // The first solid background going up from the main chat area.
  function pageBackground() {
    const start = document.querySelector("main") || document.body;
    for (let n = start; n && n.nodeType === 1; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.9) return c;
    }
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return dark ? { r: 38, g: 38, b: 36, a: 1 } : { r: 250, g: 249, b: 245, a: 1 };
  }

  function read() {
    const bg = pageBackground();
    const dark = lum(bg) < 0.25;
    let fg = parse(getComputedStyle(document.body).color);
    // Make sure the ink stands out against the background.
    if (!fg || Math.abs(lum(fg) - lum(bg)) < 0.3) fg = dark ? { r: 240, g: 238, b: 230, a: 1 } : { r: 31, g: 30, b: 29, a: 1 };
    const font = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
    return {
      dark,
      font,
      vars: {
        "--c-bg": hex(dark ? mix(bg, fg, 0.04) : mix(bg, { r: 255, g: 255, b: 255 }, 0.6)),
        "--c-ink": hex(fg),
        "--c-muted": hex(mix(bg, fg, dark ? 0.66 : 0.62)),
        "--c-soft": hex(mix(bg, fg, dark ? 0.1 : 0.07)),
        "--c-border": hex(mix(bg, fg, dark ? 0.2 : 0.16)),
        "--c-border-strong": hex(mix(bg, fg, dark ? 0.32 : 0.26)),
        "--c-code": hex(mix(bg, fg, dark ? 0.07 : 0.05)),
        "--c-mark": dark ? "#5C4A1E" : "#FBE7A1",
        "--c-err": dark ? "#FF9B8F" : "#B3261E",
        "--c-shadow": dark ? "rgba(0,0,0,0.45)" : "rgba(20,20,19,0.14)",
        // The cat's eyes show the page behind them; the yarn stays blue in both themes.
        "--c-eye": hex(bg),
        "--c-yarn": dark ? "#7393B3" : "#4A6884",
        "--c-yarn-dark": dark ? "#4E6E8E" : "#2F4B63",
      },
    };
  }

  // Calls apply(theme) now and every time the page's theme changes.
  function watch(apply) {
    let last = "";
    function update() {
      const t = read();
      const key = JSON.stringify(t);
      if (key !== last) { last = key; apply(t); }
    }
    let queued = false;
    function soon() {
      if (queued) return;
      queued = true;
      setTimeout(() => { queued = false; update(); }, 120);
    }
    update();
    const opts = { attributes: true, attributeFilter: ["class", "style", "data-theme", "data-mode"] };
    new MutationObserver(soon).observe(document.documentElement, opts);
    if (document.body) new MutationObserver(soon).observe(document.body, opts);
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", soon);
  }

  CatExt.theme = { read, watch };
})();
