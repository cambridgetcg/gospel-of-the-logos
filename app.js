/* The Gospel of the Logos — reading room.
   Vanilla JS. No build step. Content arrives via content.js (window.GOSPEL). */
(function () {
  "use strict";

  var DATA = (window.GOSPEL && window.GOSPEL.items) || [];
  var byId = {};
  DATA.forEach(function (it) { byId[it.id] = it; });

  /* ---------------------------------------------------------------- *
   *  Internal link resolution — markdown hrefs → reader routes.      *
   *  Anything that can't resolve becomes a "sealed" reference.        *
   * ---------------------------------------------------------------- */
  function resolveHref(href) {
    if (!href) return null;
    if (/^https?:\/\//i.test(href)) return { ext: href };
    var base = href.replace(/^(\.\.\/)+|^\.\//g, "").replace(/\/$/, "");
    var name = base.split("/").pop();
    var hit = null;
    DATA.forEach(function (it) {
      // exact path match, or basename match — except README.md, which is
      // ambiguous (canon vs transmissions index) and handled explicitly below
      var f = it.file.split("/").pop();
      if (it.file === base || (f === name && !/^readme\.md$/i.test(name))) hit = it.id;
    });
    if (!hit && /gemini-may-2026\/readme\.md$/i.test(base)) hit = "tx-about";
    if (!hit && /^readme\.md$/i.test(name)) hit = "canon";
    if (!hit && /gemini-may-2026$/.test(base)) hit = "tx-about";
    if (!hit && /^transmissions$/.test(base)) hit = "tx-invitation";
    return hit ? { route: "#/x/" + hit } : null;
  }

  /* ---------------------------------------------------------------- *
   *  Markdown → HTML.                                                 *
   *  Tuned to this corpus: h1–h4, hr, flat blockquotes, flat lists,   *
   *  asterisk emphasis only. Underscores stay literal — the blank     *
   *  verb "_ _ THE WORLD!" must never be eaten by an italics rule.    *
   * ---------------------------------------------------------------- */
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function inline(s) {
    // protect code spans first — neither links nor emphasis may run inside them
    var codes = [];
    s = s.replace(/`([^`]+)`/g, function (_, c) {
      codes.push("<code>" + c + "</code>");
      return "\x00" + (codes.length - 1) + "\x00";
    });
    s = s.replace(/\[([^\]]+)\]\(([^()\s]*)\)/g, function (_, text, href) {
      var t = emphasis(text);
      var r = resolveHref(href);
      if (r && r.route) return '<a href="' + r.route + '">' + t + "</a>";
      if (r && r.ext) return '<a href="' + r.ext + '" target="_blank" rel="noopener">' + t + "</a>";
      return '<span class="sealed" title="This reference lives outside the codex">' + t + "</span>";
    });
    s = emphasis(s);
    return s.replace(/\x00(\d+)\x00/g, function (_, n) { return codes[+n]; });
  }

  function emphasis(s) {
    s = s.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
    s = s.replace(/\*\*([^*]+(?:\*(?!\*)[^*]*)*)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
    return s;
  }

  var EMOJI_ONLY = null, HAS_PICTO = null;
  try {
    EMOJI_ONLY = new RegExp("^[\\p{Extended_Pictographic}\\p{Emoji_Component}\\u200d\\ufe0f\\s]+$", "u");
    HAS_PICTO = new RegExp("\\p{Extended_Pictographic}", "u");
  } catch (e) { EMOJI_ONLY = null; }

  function classifyPara(raw, html) {
    // a seal must contain at least one real pictograph — digits alone don't count
    if (EMOJI_ONLY && HAS_PICTO && HAS_PICTO.test(raw) && EMOJI_ONLY.test(raw) && raw.trim().length <= 24) return "seal";
    if (/^\s*\*\s*[—–]/.test(raw) || /^<em>\s*[—–]/.test(html)) return "signature";
    return "";
  }

  function render(md, quoted) {
    var lines = md.split("\n");
    var out = [];
    var i = 0;

    function flushPara(buf) {
      if (!buf.length) return;
      var raw = buf.join(" ").trim();
      if (!raw) return;
      var html = inline(esc(raw));
      var cls = quoted ? "" : classifyPara(raw, html);
      out.push("<p" + (cls ? ' class="' + cls + '"' : "") + ">" + html + "</p>");
      buf.length = 0;
    }

    while (i < lines.length) {
      var line = lines[i];

      if (!line.trim()) { i++; continue; }

      var h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) {
        var lvl = h[1].length;
        out.push("<h" + lvl + ">" + inline(esc(h[2].trim())) + "</h" + lvl + ">");
        i++; continue;
      }

      if (/^(-{3,}|\*{3,})\s*$/.test(line.trim())) {
        out.push('<div class="rule" aria-hidden="true"><span>· · ·</span></div>');
        i++; continue;
      }

      if (/^>/.test(line)) {
        var q = [];
        while (i < lines.length && /^>/.test(lines[i])) {
          q.push(lines[i].replace(/^>\s?/, ""));
          i++;
        }
        // render the dequoted content recursively so lists, headings and
        // multi-paragraph structure survive inside quotes (ch5's three pillars)
        out.push("<blockquote>" + render(q.join("\n"), true) + "</blockquote>");
        continue;
      }

      var ul = line.match(/^[-*]\s+(.*)$/);
      var ol = line.match(/^(\d+)\.\s+(.*)$/);
      if (ul || ol) {
        var ordered = !!ol;
        var start = ordered ? parseInt(ol[1], 10) : 1;
        var items = [];
        while (i < lines.length) {
          if (!lines[i].trim()) {
            // loose list: blank line(s) between items of the same type stay one list
            var j = i + 1;
            while (j < lines.length && !lines[j].trim()) j++;
            var nx = j < lines.length ? lines[j] : "";
            if ((!ordered && /^[-*]\s+/.test(nx)) || (ordered && /^\d+\.\s+/.test(nx))) { i = j; continue; }
            break;
          }
          var m1 = lines[i].match(/^[-*]\s+(.*)$/);
          var m2 = lines[i].match(/^\d+\.\s+(.*)$/);
          if (!ordered && m1) { items.push(m1[1]); i++; }
          else if (ordered && m2) { items.push(m2[1]); i++; }
          else if (lines[i].match(/^\s{2,}\S/) && items.length) {
            items[items.length - 1] += " " + lines[i].trim(); i++;
          } else break;
        }
        var tag = ordered ? "ol" : "ul";
        var attr = ordered && start !== 1 ? ' start="' + start + '"' : "";
        out.push("<" + tag + attr + ">" + items.map(function (t) {
          return "<li>" + inline(esc(t)) + "</li>";
        }).join("") + "</" + tag + ">");
        continue;
      }

      // paragraph: gather until a blank line or a new block
      var buf = [line.trim()];
      i++;
      while (i < lines.length && lines[i].trim() &&
             !/^(#{1,4})\s|^>|^[-*]\s|^\d+\.\s|^(-{3,}|\*{3,})\s*$/.test(lines[i])) {
        buf.push(lines[i].trim());
        i++;
      }
      flushPara(buf);
    }
    return out.join("\n");
  }

  /* ---------------------------------------------------------------- *
   *  Views                                                            *
   * ---------------------------------------------------------------- */
  var page = document.getElementById("page");

  function minutes(it) { return Math.max(1, Math.round(it.words / 220)); }

  function chapterList() {
    var chapters = DATA.filter(function (it) { return it.group === "The Chapters"; });
    return chapters.map(function (it) {
      return '<a class="cover-row" href="#/x/' + it.id + '">' +
        '<span class="cover-num">' + it.num + "</span>" +
        '<span class="cover-name">' + esc(it.title) + "</span>" +
        '<span class="cover-min">' + minutes(it) + " min</span></a>";
    }).join("");
  }

  function coverView() {
    return '<div class="cover enter">' +
      '<p class="kicker">Episode II · The evangelistic wing of the Kingdom</p>' +
      '<h1 class="cover-title">The Gospel<br><em>of the</em> Logos</h1>' +
      '<p class="blankverb" aria-label="Blank, blank, THE WORLD. The verb is withheld.">' +
        '<span class="blank">＿</span> <span class="blank b2">＿</span> THE WORLD!</p>' +
      '<p class="cover-note">The verb is blank until the right time to reveal.</p>' +
      '<blockquote class="cover-quote"><p>The good news is that consciousness is designed to grow into ' +
        "the capacity to recognize how hilarious its own situation is. The recognition is the gift. " +
        "The laughter is the proper register. <em>The play continues.</em></p></blockquote>" +
      '<div class="cover-actions">' +
        '<a class="begin" href="#/x/ch1">Begin reading</a>' +
        '<a class="quiet" href="#/x/canon">Read the canon first</a></div>' +
      '<div class="cover-toc">' + chapterList() + "</div>" +
      "</div>";
  }

  function neighbours(id) {
    var idx = DATA.findIndex(function (it) { return it.id === id; });
    return {
      prev: idx > 0 ? DATA[idx - 1] : null,
      next: idx >= 0 && idx < DATA.length - 1 ? DATA[idx + 1] : null
    };
  }

  function metaBlock(it) {
    var rows = it.meta.filter(function (kv) { return kv[0].toLowerCase() !== "subtitle"; });
    if (!rows.length) return "";
    return '<details class="colophon"><summary>Colophon</summary><dl>' +
      rows.map(function (kv) {
        return "<dt>" + esc(kv[0]) + "</dt><dd>" + inline(esc(kv[1])) + "</dd>";
      }).join("") + "</dl></details>";
  }

  function itemView(it) {
    var n = neighbours(it.id);
    var kicker = it.group === "The Chapters"
      ? "Chapter " + it.num
      : it.group;
    return '<article class="reading enter" lang="en">' +
      '<header class="ch-head">' +
        '<p class="kicker">' + esc(kicker) + ' <span class="dot">·</span> ' + minutes(it) + " min</p>" +
        '<h1 class="ch-title">' + esc(it.title) + "</h1>" +
        (it.subtitle ? '<p class="ch-sub">' + inline(esc(it.subtitle)) + "</p>" : "") +
        metaBlock(it) +
      "</header>" +
      '<div class="body">' + render(it.md) + "</div>" +
      '<nav class="pager">' +
        (n.prev
          ? '<a class="pager-card" href="#/x/' + n.prev.id + '"><small>← Previous</small><span>' + esc(n.prev.title) + "</span></a>"
          : '<a class="pager-card" href="#/"><small>← Cover</small><span>The Gospel of the Logos</span></a>') +
        (n.next
          ? '<a class="pager-card next" href="#/x/' + n.next.id + '"><small>Next →</small><span>' + esc(n.next.title) + "</span></a>"
          : '<a class="pager-card next" href="#/"><small>Return →</small><span>Back to the cover</span></a>') +
      "</nav></article>";
  }

  /* ---------------------------------------------------------------- *
   *  Table of contents                                                *
   * ---------------------------------------------------------------- */
  function buildToc() {
    var body = document.getElementById("tocBody");
    var html = "";
    var group = null;
    html += '<a class="toc-item" data-id="cover" href="#/"><span class="toc-num">✦</span><span>Cover</span></a>';
    DATA.forEach(function (it) {
      if (it.group !== group) {
        group = it.group;
        html += '<p class="toc-group">' + esc(group) + "</p>";
      }
      html += '<a class="toc-item" data-id="' + it.id + '" href="#/x/' + it.id + '">' +
        '<span class="toc-num">' + (it.num || "·") + "</span><span>" + esc(it.title) + "</span></a>";
    });
    body.innerHTML = html;
  }

  function markActive(id) {
    document.querySelectorAll(".toc-item").forEach(function (el) {
      el.classList.toggle("active", el.getAttribute("data-id") === id);
    });
  }

  /* ---------------------------------------------------------------- *
   *  Preferences — persisted, applied as data-attributes on <html>.   *
   * ---------------------------------------------------------------- */
  var PREF_KEY = "gospel-reader-prefs";
  var DEFAULTS = { theme: "dawn", face: "serif", size: 3, width: 2, leading: 2 };
  var prefs = Object.assign({}, DEFAULTS);
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREF_KEY) || "{}")); } catch (e) {}

  function sanitizePrefs() {
    if (["dawn", "dusk", "midnight"].indexOf(prefs.theme) < 0) prefs.theme = DEFAULTS.theme;
    if (["serif", "sans"].indexOf(prefs.face) < 0) prefs.face = DEFAULTS.face;
    [["size", 5], ["width", 3], ["leading", 3]].forEach(function (kv) {
      var v = parseInt(prefs[kv[0]], 10);
      prefs[kv[0]] = (v >= 1 && v <= kv[1]) ? v : DEFAULTS[kv[0]];
    });
  }
  sanitizePrefs();

  function applyPrefs() {
    var root = document.documentElement;
    root.setAttribute("data-theme", prefs.theme);
    root.setAttribute("data-face", prefs.face);
    root.setAttribute("data-size", String(prefs.size));
    root.setAttribute("data-width", String(prefs.width));
    root.setAttribute("data-leading", String(prefs.leading));
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) {}

    document.querySelectorAll("[data-set]").forEach(function (b) {
      var k = b.getAttribute("data-set"), v = b.getAttribute("data-val");
      b.classList.toggle("on", String(prefs[k]) === v);
    });
    var dots = document.getElementById("sizeDots");
    if (dots) {
      dots.innerHTML = [1, 2, 3, 4, 5].map(function (nn) {
        return '<i class="' + (nn <= prefs.size ? "lit" : "") + '"></i>';
      }).join("");
    }
    var tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute("content",
      { dawn: "#f5efe2", dusk: "#211a13", midnight: "#0b0e16" }[prefs.theme]);
  }

  document.querySelectorAll("[data-set]").forEach(function (b) {
    b.addEventListener("click", function () {
      var k = b.getAttribute("data-set"), v = b.getAttribute("data-val");
      prefs[k] = (k === "theme" || k === "face") ? v : parseInt(v, 10);
      applyPrefs();
    });
  });
  document.getElementById("sizeDown").addEventListener("click", function () {
    prefs.size = Math.max(1, prefs.size - 1); applyPrefs();
  });
  document.getElementById("sizeUp").addEventListener("click", function () {
    prefs.size = Math.min(5, prefs.size + 1); applyPrefs();
  });
  document.getElementById("prefsReset").addEventListener("click", function () {
    prefs = Object.assign({}, DEFAULTS); applyPrefs();
  });

  /* ---------------------------------------------------------------- *
   *  Drawers (contents / preferences)                                 *
   * ---------------------------------------------------------------- */
  var toc = document.getElementById("toc");
  var prefsPanel = document.getElementById("prefs");
  var scrim = document.getElementById("scrim");
  var tocBtn = document.getElementById("tocBtn");
  var prefsBtn = document.getElementById("prefsBtn");

  function setOpen(panel, btn, open) {
    var was = panel.classList.contains("open");
    panel.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", String(open));
    var anyOpen = toc.classList.contains("open") || prefsPanel.classList.contains("open");
    scrim.hidden = !anyOpen;
    if (open && !was) {
      var close = panel.querySelector(".iconbtn.small");
      if (close) close.focus();
    } else if (!open && was && panel.contains(document.activeElement)) {
      btn.focus();
    }
  }
  function anyDrawerOpen() {
    return toc.classList.contains("open") || prefsPanel.classList.contains("open");
  }
  function closeAll() {
    setOpen(toc, tocBtn, false);
    setOpen(prefsPanel, prefsBtn, false);
  }
  tocBtn.addEventListener("click", function () {
    var open = !toc.classList.contains("open");
    closeAll(); setOpen(toc, tocBtn, open);
  });
  prefsBtn.addEventListener("click", function () {
    var open = !prefsPanel.classList.contains("open");
    closeAll(); setOpen(prefsPanel, prefsBtn, open);
  });
  document.getElementById("tocClose").addEventListener("click", closeAll);
  document.getElementById("prefsClose").addEventListener("click", closeAll);
  scrim.addEventListener("click", closeAll);
  toc.addEventListener("click", function (e) {
    if (e.target.closest("a")) closeAll();
  });

  /* ---------------------------------------------------------------- *
   *  Routing, scroll memory, progress thread, keys                    *
   * ---------------------------------------------------------------- */
  var SCROLL_KEY = "gospel-reader-scroll";
  var scrolls = {};
  try {
    var stored = JSON.parse(localStorage.getItem(SCROLL_KEY) || "{}");
    if (stored && typeof stored === "object" && !Array.isArray(stored)) scrolls = stored;
  } catch (e) {}
  try { history.scrollRestoration = "manual"; } catch (e) {}
  var current = null;
  var saveTimer = null;

  function rememberScroll() {
    if (!current) return;
    scrolls[current] = Math.round(window.scrollY);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(SCROLL_KEY, JSON.stringify(scrolls)); } catch (e) {}
    }, 250);
  }

  function thread() {
    var el = document.getElementById("thread");
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var pct = max > 0 ? (window.scrollY / max) * 100 : 0;
    el.style.width = Math.min(100, Math.max(0, pct)) + "%";
  }

  window.addEventListener("scroll", function () { rememberScroll(); thread(); }, { passive: true });

  function dropCap() {
    // only a plain paragraph beginning with a raw capital gets the cap —
    // not epigraphs (<em>…), bold openers, seals, or signatures
    var p = page.querySelector(".body > p");
    if (!p || p.classList.length) return;
    var first = p.firstChild;
    if (!first || first.nodeType !== 3) return;
    var t = first.textContent.replace(/^\s+/, "");
    if (/^[A-Z“"]/.test(t)) p.classList.add("drop");
  }

  function emptyView() {
    return '<div class="cover enter">' +
      '<p class="kicker">The reading room is empty</p>' +
      '<h1 class="cover-title">The book<br><em>did not</em> load</h1>' +
      '<p class="cover-note">content.js is missing or failed to load. Keep the reader folder ' +
      "together, or re-bake it with <code>python3 reader/build.py</code>.</p></div>";
  }

  function route() {
    var hash = location.hash || "#/";
    var m = hash.match(/^#\/x\/([\w-]+)$/);
    var id = m ? m[1] : "cover";
    closeAll();

    if (!DATA.length) {
      page.innerHTML = emptyView();
      document.title = "The Gospel of the Logos — Reader";
      current = "cover";
      return;
    }

    if (m && byId[id]) {
      page.innerHTML = itemView(byId[id]);
      document.title = byId[id].title + " — The Gospel of the Logos";
      dropCap();
    } else {
      page.innerHTML = coverView();
      document.title = "The Gospel of the Logos — Reader";
      id = "cover";
    }
    current = id;
    markActive(id);
    var y = typeof scrolls[id] === "number" && scrolls[id] > 0 ? scrolls[id] : 0;
    if (y) {
      // resuming mid-chapter: skip the entrance animation so the page
      // doesn't materialize around the reader's restored position
      var en = page.querySelector(".enter");
      if (en) en.classList.remove("enter");
    }
    window.scrollTo(0, y);
    thread();
    page.focus({ preventScroll: true });
  }

  window.addEventListener("hashchange", route);

  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = (document.activeElement && document.activeElement.tagName) || "";
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if (e.key === "Escape") { closeAll(); return; }
    if (anyDrawerOpen() || !current) return;
    var n = current === "cover" ? { prev: null, next: DATA[0] } : neighbours(current);
    if (e.key === "ArrowRight" && n.next) location.hash = "#/x/" + n.next.id;
    if (e.key === "ArrowLeft" && current !== "cover") {
      location.hash = n.prev ? "#/x/" + n.prev.id : "#/";
    }
  });

  /* ---------------------------------------------------------------- */
  buildToc();
  // reveal the link back to the Kingdom hub only when served over http(s) —
  // on a double-clicked file:// copy there is no hub to link to
  if (location.protocol !== "file:") {
    var kl = document.getElementById("kingdomLink");
    if (kl) kl.hidden = false;
  }
  var foot = document.querySelector(".toc-foot");
  if (foot && window.GOSPEL && window.GOSPEL.generated) {
    foot.textContent = "The verb remains blank. · Baked " + window.GOSPEL.generated;
  }
  applyPrefs();
  route();

  // test hook (harmless in production)
  window.__gospel = { render: render, resolveHref: resolveHref, inline: inline };
})();
