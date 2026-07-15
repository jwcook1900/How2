/* ============================================================
   GotIt Guides — private stats page
   Enter the passphrase (matches the STATS_KEY env var) to read
   first-party analytics from the backend.
   ============================================================ */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Current view state for the interactive bits (chips re-render; the name
  // filter narrows in place so typing never loses focus).
  var DATA = null;
  var sortKey = "views";   // views | unique | created | active
  var newOnly = false;     // only guides created in the last 7 days
  var range = 30;          // chart window: 7 | 14 | 30 days
  var q = "";              // name filter

  function render(s) { DATA = s; paint(); }

  function chip(label, on, attrs) {
    return '<button type="button" class="stat-chip' + (on ? " on" : "") + '" ' + attrs + ">" + label + "</button>";
  }

  function sortedGuides() {
    var list = (DATA.guides || []).slice();
    if (newOnly) {
      list = list.filter(function (g) {
        return g.created && (Date.now() - Date.parse(g.created)) < 7 * 86400000;
      });
    }
    list.sort(function (a, b) {
      if (sortKey === "unique") return (b.unique || 0) - (a.unique || 0);
      if (sortKey === "created") return String(b.created || "").localeCompare(String(a.created || ""));
      if (sortKey === "active") return String(b.lastActive || "").localeCompare(String(a.lastActive || ""));
      return (b.views || 0) - (a.views || 0);
    });
    return list;
  }

  function applyNameFilter() {
    var wrap = $("statGuides");
    if (!wrap) return;
    var needle = q.trim().toLowerCase();
    Array.prototype.forEach.call(wrap.children, function (c) {
      var slug = (c.getAttribute("data-slug") || "").toLowerCase();
      c.style.display = (!needle || slug.indexOf(needle) >= 0) ? "" : "none";
    });
  }

  function exportCsv(list) {
    var rows = [["slug", "views", "visitors", "shares", "publishes", "created", "lastActive"]];
    list.forEach(function (g) {
      rows.push([g.slug, g.views || 0, g.unique || 0, g.shares || 0, g.publishes || 0,
        (g.created || "").slice(0, 10), (g.lastActive || "").slice(0, 10)]);
    });
    var csv = rows.map(function (r) {
      return r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(",");
    }).join("\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "gotit-guides-stats.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
  }

  function paint() {
    var s = DATA;
    $("statsGate").hidden = true;
    var out = $("statsOut");
    out.hidden = false;

    var cards =
      '<div class="stat-grid">' +
        statCard("\uD83D\uDCD8", s.publishes || 0, "Guides published") +
        statCard("\uD83D\uDC40", s.views || 0, "Guide views") +
        statCard("\uD83D\uDC64", s.uniqueVisitors || 0, "Unique visitors") +
        statCard("\uD83D\uDD17", s.shares || 0, "Shares") +
      "</div>";

    // Views per day (window selectable: 7 / 14 / 30, viewer-local days)
    var vdAll = s.viewsDaily || [];
    var vd = vdAll.slice(-range);
    var vdTotal = vd.reduce(function (a, x) { return a + x.v; }, 0);
    var vdPeak = vd.reduce(function (a, x) { return Math.max(a, x.v); }, 0);
    var rangeChips = '<span class="stat-range">' +
      [7, 14, 30].map(function (r) { return chip(r + "d", range === r, 'data-range="' + r + '"'); }).join("") +
      "</span>";
    var dailyHtml = vdAll.length
      ? '<h2 class="stat-h2">Views \u2014 last ' + range + " days" +
          ' <span class="stat-sub">(' + vdTotal + " view" + (vdTotal === 1 ? "" : "s") +
          (vdPeak ? " \u00B7 peak " + vdPeak + "/day" : "") + ")</span>" + rangeChips + "</h2>" +
        bars(vd, "stat-chart") +
        (vd.length ? '<div class="stat-chart-axis"><span>' + esc(fmtD(vd[0].d)) + "</span><span>" +
          esc(fmtD(vd[vd.length - 1].d)) + " (today)</span></div>" : "")
      : "";

    // Where views come from (referrer domain or "direct"; collected on view
    // events only from when ref tracking shipped, so older views don't show)
    var refs = s.refs || {};
    var refKeys = Object.keys(refs).sort(function (a, b) { return refs[b] - refs[a]; }).slice(0, 12);
    var refTotal = refKeys.reduce(function (a, k) { return a + refs[k]; }, 0);
    var refsHtml = refKeys.length
      ? '<h2 class="stat-h2">Where views come from <span class="stat-sub">(' + refTotal +
          " view" + (refTotal === 1 ? "" : "s") + " with a known source)</span></h2>" +
        '<ul class="stat-list stat-refs">' + refKeys.map(function (k) {
          var label = k === "direct" ? "🔗 Direct (typed, app, or no referrer)" : "🌐 " + esc(k);
          return "<li><b>" + label + "</b><span>" + refs[k] + pct(refs[k], refTotal) + "</span></li>";
        }).join("") + "</ul>"
      : "";

    // Creation funnel (each % is of the step before)
    var fu = s.funnel || {};
    var funnelHtml = (fu.opens || fu.starts || fu.drafts || fu.published)
      ? '<h2 class="stat-h2">Creation funnel <span class="stat-sub">(each % is of the step before)</span></h2>' +
        '<div class="stat-grid">' +
          statCard("\uD83D\uDEAA", fu.opens || 0, "Builder opened") +
          statCard("\uD83D\uDC46", fu.starts || 0, "Method chosen" + pct(fu.starts, fu.opens)) +
          statCard("\uD83D\uDCDD", fu.drafts || 0, "Drafts built" + pct(fu.drafts, fu.starts)) +
          // "Tried to publish" only exists for events after publish_tap shipped
          (fu.tried ? statCard("\uD83C\uDFAF", fu.tried, "Tried to publish" + pct(fu.tried, fu.drafts)) : "") +
          statCard("\uD83D\uDE80", fu.published || 0, "Published" + pct(fu.published, fu.tried || fu.drafts)) +
        "</div>" +
        (fu.errors
          ? '<p class="stat-empty" style="margin:-14px 0 26px">\u26A0\uFE0F ' + fu.errors +
            " publish attempt" + (fu.errors === 1 ? "" : "s") +
            " failed (image size or network) \u2014 those guides still show as drafts above.</p>"
          : "")
      : "";

    // Which categories people pick
    var CAT_META = {
      pet: "\uD83D\uDC36 Pet Care", home: "\uD83C\uDFE0 Home / Airbnb", kids: "\uD83D\uDC76 Kids",
      staff: "\uD83E\uDDD1\u200D\uD83D\uDCBC Staff", event: "\uD83C\uDF89 Event", cleaner: "\uD83E\uDDF9 Cleaner",
      gardener: "\uD83C\uDF33 Gardener", physio: "\uD83E\uDDD1\u200D\u2695\uFE0F Physio", housesit: "\uD83C\uDFE1 House Sitter",
      care: "\uD83D\uDC75 Aged Care", other: "\u270F\uFE0F Other"
    };
    var cats = s.cats || {};
    var catKeys = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; });
    var catsHtml = catKeys.length
      ? '<div class="stat-cats">' + catKeys.map(function (k) {
          return '<span class="sg-feat">' + (CAT_META[k] || esc(k)) + " <b>" + cats[k] + "</b></span>";
        }).join("") + "</div>"
      : "";

    // How guides are started
    var sm = s.startMethods || {};
    var startTotal = (sm.talk || 0) + (sm.paste || 0) + (sm.scratch || 0) + (sm.photo || 0);
    var startHtml = startTotal
      ? '<h2 class="stat-h2">How guides are started</h2><div class="stat-grid">' +
          statCard("\uD83C\uDF99\uFE0F", sm.talk || 0, "Talk it out" + pct(sm.talk, startTotal)) +
          statCard("\uD83D\uDCCB", sm.paste || 0, "Paste notes" + pct(sm.paste, startTotal)) +
          statCard("\u270D\uFE0F", sm.scratch || 0, "From scratch" + pct(sm.scratch, startTotal)) +
          statCard("\uD83D\uDCF8", sm.photo || 0, "Photo of a guide" + pct(sm.photo, startTotal)) +
        "</div>"
      : "";

    // Features used across published guides
    var f = s.features || {};
    var pub = s.publishes || 0;
    var featRows = [
      ["\uD83D\uDCF8", "photo", "Photos"], ["\uD83C\uDFAC", "video", "Videos"], ["\uD83D\uDDBC\uFE0F", "cover", "Cover photo"],
      ["\u23F0", "routine", "Daily routine"], ["\uD83D\uDCD3", "log", "Logs"], ["\uD83D\uDD12", "lock", "Locked"],
    ];
    var anyFeat = featRows.some(function (r) { return f[r[1]]; });
    var featHtml = anyFeat
      ? '<h2 class="stat-h2">Features used in guides' + (pub ? ' <span class="stat-sub">(of ' + pub + " published)</span>" : "") + "</h2>" +
        '<div class="stat-grid">' +
          featRows.map(function (r) {
            return statCard(r[0], f[r[1]] || 0, r[2] + pct(f[r[1]], pub));
          }).join("") +
        "</div>"
      : "";

    // Per-guide breakdown, with sort / new-only / CSV controls
    var list = sortedGuides();
    var guidesHtml;
    if ((s.guides || []).length) {
      var controls =
        '<div class="stat-chipbar">' +
          '<span class="stat-chip-label">Sort</span>' +
          chip("Views", sortKey === "views", 'data-sort="views"') +
          chip("Visitors", sortKey === "unique", 'data-sort="unique"') +
          chip("Newest", sortKey === "created", 'data-sort="created"') +
          chip("Recently active", sortKey === "active", 'data-sort="active"') +
          '<span class="stat-chip-sep"></span>' +
          chip("\uD83C\uDD95 New this week", newOnly, 'data-newonly="1"') +
          chip("\u2B07 CSV", false, 'data-csv="1"') +
        "</div>" +
        '<input type="search" id="sgFilter" class="stat-filter" placeholder="Filter guides by name\u2026" autocomplete="off" />';
      guidesHtml = '<h2 class="stat-h2">Per-guide breakdown <span class="stat-sub">(' +
          list.length + (newOnly ? " new this week" : "") + ')</span></h2>' +
        controls +
        (list.length
          ? '<div class="stat-guides" id="statGuides">' + list.map(guideCard).join("") + "</div>"
          : '<p class="stat-empty">No guides match \u2014 try turning off the "New this week" filter.</p>');
    } else {
      guidesHtml = '<h2 class="stat-h2">Per-guide breakdown</h2>' +
        '<p class="stat-empty">No guide activity yet \u2014 publish or share a guide to see it here.</p>';
    }

    out.innerHTML = cards + dailyHtml + refsHtml + funnelHtml + catsHtml + startHtml + featHtml + guidesHtml +
      '<p class="stat-foot">Counts everything since analytics went live. No personal data is collected \u2014 visitors are an anonymous random id in their own browser, so unique counts start from when that shipped. ' +
      "Start-method and feature stats only include activity after this update. Daily charts use your local timezone.</p>";

    // Wire the controls (repainted each time)
    var fEl = $("sgFilter");
    if (fEl) {
      fEl.value = q;
      fEl.addEventListener("input", function () { q = this.value; applyNameFilter(); });
    }
    applyNameFilter();
    Array.prototype.forEach.call(out.querySelectorAll(".stat-chip"), function (c) {
      c.addEventListener("click", function () {
        if (c.getAttribute("data-csv")) { exportCsv(sortedGuides()); return; }
        var r = c.getAttribute("data-range");
        if (r) { range = +r; paint(); return; }
        if (c.getAttribute("data-newonly")) { newOnly = !newOnly; paint(); return; }
        var sKey = c.getAttribute("data-sort");
        if (sKey) { sortKey = sKey; paint(); }
      });
    });
  }

  // "2026-07-08" -> "8 Jul"
  function fmtD(d) {
    var p = String(d).split("-");
    var M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return (+p[2]) + " " + (M[+p[1] - 1] || "");
  }
  // Daily-views bars: single brand hue, zero days as baseline stubs, today
  // emphasised, per-bar value in a native tooltip.
  function bars(daily, cls) {
    var max = 0;
    daily.forEach(function (x) { if (x.v > max) max = x.v; });
    var out = '<div class="' + cls + '" aria-hidden="true">';
    daily.forEach(function (x, i) {
      var last = i === daily.length - 1;
      var h = x.v && max ? Math.max(8, Math.round(x.v / max * 100)) + "%" : "2px";
      var tip = esc(fmtD(x.d)) + " \u2014 " + x.v + " view" + (x.v === 1 ? "" : "s") +
        (x.u ? " \u00B7 " + x.u + " visitor" + (x.u === 1 ? "" : "s") : "");
      out += '<i class="' + (x.v ? "" : "z") + (last ? " today" : "") +
        '" style="height:' + h + '" title="' + tip + '"></i>';
    });
    return out + "</div>";
  }

  var FEAT_META = {
    photo: ["📸", "Photos"], video: ["🎬", "Videos"], cover: ["🖼️", "Cover photo"],
    routine: ["⏰", "Routine"], log: ["📓", "Logs"], lock: ["🔒", "Locked"],
  };
  function guideCard(g) {
    var feats = (g.features || []).map(function (f) {
      var m = FEAT_META[f] || ["•", f];
      return '<span class="sg-feat">' + m[0] + " " + esc(m[1]) + "</span>";
    }).join("");
    var metric = function (emoji, n, label) {
      return '<span class="sg-metric">' + emoji + " <b>" + (n || 0) + "</b> " + label + "</span>";
    };
    var when = relTime(g.lastActive);
    var created = g.created ? fmtD(String(g.created).slice(0, 10)) : "";
    var isNew = g.created && (Date.now() - Date.parse(g.created)) < 7 * 86400000;
    var stamp = (created ? "created " + created : "") +
      (created && when ? " \u00B7 " : "") + (when ? "active " + when : "");
    return '<div class="sg-card" data-slug="' + esc(g.slug) + '">' +
      '<div class="sg-top">' +
        '<a class="sg-name" href="/g/' + encodeURIComponent(g.slug) + '" target="_blank" rel="noopener">' + esc(g.slug) + "</a>" +
        (isNew ? '<span class="sg-new">NEW</span>' : "") +
        (stamp ? '<span class="sg-when">' + esc(stamp) + "</span>" : "") +
      "</div>" +
      '<div class="sg-metrics">' +
        metric("👀", g.views, "views") + metric("👤", g.unique, "visitors") +
        metric("🔗", g.shares, "shares") + metric("📘", g.publishes, "publishes") +
      "</div>" +
      srcChips(g.refs) +
      (g.daily ? bars(g.daily, "sg-daily") : "") +
      (feats ? '<div class="sg-feats">' + feats + "</div>" : "") +
    "</div>";
  }

  // Top traffic sources as small chips, e.g. "reddit.com 12 · direct 3".
  function srcChips(refs) {
    if (!refs) return "";
    var keys = Object.keys(refs).sort(function (a, b) { return refs[b] - refs[a]; }).slice(0, 3);
    if (!keys.length) return "";
    return '<div class="sg-srcs">from ' + keys.map(function (k) {
      return '<span class="sg-feat">' + (k === "direct" ? "direct" : esc(k)) + " <b>" + refs[k] + "</b></span>";
    }).join(" ") + "</div>";
  }

  // Compact "3 days ago" from an ISO timestamp.
  function relTime(iso) {
    if (!iso) return "";
    var then = new Date(iso).getTime();
    if (isNaN(then)) return "";
    var d = Math.floor((Date.now() - then) / 86400000);
    if (d <= 0) return "today";
    if (d === 1) return "yesterday";
    if (d < 7) return d + " days ago";
    if (d < 14) return "last week";
    if (d < 30) return Math.floor(d / 7) + " weeks ago";
    if (d < 60) return "last month";
    if (d < 365) return Math.floor(d / 30) + " months ago";
    return Math.floor(d / 365) + "y ago";
  }

  // "  (42%)" — a small share label; empty when there's nothing to divide by.
  function pct(n, total) {
    if (!total || !n) return "";
    return " (" + Math.round((n / total) * 100) + "%)";
  }

  function statCard(emoji, num, label) {
    return '<div class="stat-card"><div class="stat-emoji">' + emoji + "</div>" +
      '<div class="stat-num">' + num + "</div>" +
      '<div class="stat-label">' + label + "</div></div>";
  }

  function go() {
    var key = ($("statsKey").value || "").trim();
    if (!key) return;
    var btn = $("statsGo"), err = $("statsErr");
    err.hidden = true;
    btn.disabled = true; btn.textContent = "Loading…";
    GotItStore.stats(key).then(function (s) {
      if (!s) { err.textContent = "Stats backend isn't available here (publish online to use it)."; err.hidden = false; }
      else render(s);
    }).catch(function () {
      err.textContent = "Wrong passphrase, or stats aren't configured yet.";
      err.hidden = false;
    }).then(function () { btn.disabled = false; btn.textContent = "View stats"; });
  }

  $("statsGo").addEventListener("click", go);
  $("statsKey").addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
  setTimeout(function () { $("statsKey").focus(); }, 50);
})();
