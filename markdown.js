// MARKDOWN: turns Claude's answer text into safe HTML for the side chat.
// Handles code blocks, inline code, bold, italic, headings, lists, links and
// paragraphs. Everything is escaped first, so the answer can never inject
// its own HTML into the page.
(function () {
  const CatExt = (window.CatExt = window.CatExt || {});

  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function inline(s) {
    // Pull inline code out first so nothing inside it gets formatted.
    const codes = [];
    s = s.replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000"; });
    s = esc(s);
    s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>");
    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => "<code>" + esc(codes[+i]) + "</code>");
    return s;
  }

  function render(text) {
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let i = 0, para = [];
    const flush = () => { if (para.length) { out.push("<p>" + para.map(inline).join("<br>") + "</p>"); para = []; } };
    while (i < lines.length) {
      const line = lines[i];
      const fence = line.match(/^\s*```\s*([\w+-]*)/);
      if (fence) {
        flush();
        const lang = fence[1];
        const body = [];
        i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
        i++; // skip the closing fence (or run off the end while still streaming)
        out.push('<div class="code">' + (lang ? '<div class="lang">' + esc(lang) + "</div>" : "") + "<pre><code>" + esc(body.join("\n")) + "</code></pre></div>");
        continue;
      }
      const h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) { flush(); out.push("<h4>" + inline(h[2]) + "</h4>"); i++; continue; }
      const ul = line.match(/^\s*[-*+]\s+(.*)$/), ol = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
      if (ul || ol) {
        flush();
        const tag = ul ? "ul" : "ol";
        const items = [];
        const start = ol ? +ol[1] : 1;
        while (i < lines.length) {
          const m = ul ? lines[i].match(/^\s*[-*+]\s+(.*)$/) : lines[i].match(/^\s*\d+[.)]\s+(.*)$/);
          if (!m) break;
          items.push("<li>" + inline(ul ? m[1] : m[1]) + "</li>");
          i++;
        }
        out.push("<" + tag + (tag === "ol" && start !== 1 ? ' start="' + start + '"' : "") + ">" + items.join("") + "</" + tag + ">");
        continue;
      }
      if (!line.trim()) { flush(); i++; continue; }
      para.push(line);
      i++;
    }
    flush();
    return out.join("");
  }

  CatExt.markdown = { render };
})();
