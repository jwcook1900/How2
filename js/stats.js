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
  var range = 30;          // chart window: 7 | 14 | 30 days (all-time mode only)
  var q = "";              // name filter
  var showAllGuides = false; // collapsed by default: top 3 + "Show all"
  // Whole-page date window: when set, the backend answers every number for
  // this range and the page labels itself accordingly. null = all time.
  var win = null;          // {from, to} as local YYYY-MM-DD
  var winPreset = "all";   // lit chip: all | 7 | 14 | 30 | custom
  var winActive = false;   // set from the response each paint
  var statsKeyVal = "";    // held after unlock so window changes can refetch

  function render(s) { DATA = s; paint(); }

  function localDayStr(daysAgo) {
    var tzOff = new Date().getTimezoneOffset();
    return new Date(Date.now() - tzOff * 60000 - (daysAgo || 0) * 86400000).toISOString().slice(0, 10);
  }
  function refetch() {
    if (!statsKeyVal) return;
    GotItStore.stats(statsKeyVal, win).then(function (s) { if (s) render(s); })
      .catch(function () { /* keep showing the last good numbers */ });
  }

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

  // Shows/hides guide cards from the filter text AND the collapsed state:
  // collapsed shows the top 3 (of the current sort); typing a search always
  // looks through ALL guides, so a hidden card can still be found.
  function applyNameFilter() {
    var wrap = $("statGuides");
    if (!wrap) return;
    var needle = q.trim().toLowerCase();
    var shown = 0;
    Array.prototype.forEach.call(wrap.children, function (c) {
      var slug = (c.getAttribute("data-slug") || "").toLowerCase();
      var match = !needle || slug.indexOf(needle) >= 0;
      var visible = match && (showAllGuides || needle || shown < 3);
      if (visible) shown++;
      c.style.display = visible ? "" : "none";
    });
    var more = $("sgMore");
    if (more) {
      var total = wrap.children.length;
      // While searching, everything that matches is already visible.
      more.hidden = !!needle || total <= 3;
      more.textContent = showAllGuides
        ? "Show fewer ▴"
        : "Show all " + total + " guides ▾";
    }
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

    // Whole-page window: present when the backend answered for a date range.
    var W = s.window || null;
    winActive = !!W;
    var winLabel = W ? fmtD(W.from) + " \u2192 " + fmtD(W.to) : "";
    var today = localDayStr(0);
    // Axis suffix: only claim "(today)" when the last bar really is today.
    var endTag = function (axis) {
      return axis.length && axis[axis.length - 1].d === today ? " (today)" : "";
    };

    // The window bar drives everything below it: quick ranges hit the
    // backend for that span; the date pair takes any custom wave window.
    var winBar =
      '<div class="stat-winbar">' +
        chip("All time", winPreset === "all", 'data-win="all"') +
        chip("7d", winPreset === "7", 'data-win="7"') +
        chip("14d", winPreset === "14", 'data-win="14"') +
        chip("30d", winPreset === "30", 'data-win="30"') +
        '<span class="stat-win-custom">' +
          '<input type="date" id="winFrom" aria-label="From date" value="' + esc(win && win.from || "") + '" />' +
          "<span>\u2192</span>" +
          '<input type="date" id="winTo" aria-label="To date" value="' + esc(win && win.to || "") + '" />' +
          '<button type="button" class="stat-chip' + (winPreset === "custom" ? " on" : "") + '" id="winApply">Apply</button>' +
        "</span>" +
        (W ? '<span class="stat-win-note">Showing ' + esc(winLabel) + "</span>" : "") +
      "</div>";

    var cards =
      '<div class="stat-grid">' +
        statCard("\uD83D\uDCD8", s.publishes || 0, W ? "Publishes" : "Guides published") +
        statCard("\uD83D\uDC40", s.views || 0, "Guide views") +
        statCard("\uD83D\uDC64", s.uniqueVisitors || 0, "Unique visitors") +
        statCard("\uD83D\uDD17", s.shares || 0, "Shares") +
        // Accounts come straight from the user pool (exact); in a window the
        // card counts accounts CREATED in it, not the running total.
        (s.accounts
          ? (W && s.accounts.windowed != null
              ? statCard("\uD83E\uDEAA", s.accounts.windowed, "Accounts created")
              : statCard("\uD83E\uDEAA", s.accounts.total || 0, "Accounts" +
                  (s.accounts.week ? " (+" + s.accounts.week + " this week)" : "")))
          : "") +
      "</div>";

    // Views per day. All-time mode: the 7/14/30 chips slice the last 30 days.
    // Window mode: the chart IS the window, so the chips bow out.
    var vdAll = s.viewsDaily || [];
    var vd = W ? vdAll : vdAll.slice(-range);
    var vdTotal = vd.reduce(function (a, x) { return a + x.v; }, 0);
    var vdPeak = vd.reduce(function (a, x) { return Math.max(a, x.v); }, 0);
    var rangeChips = W ? "" : '<span class="stat-range">' +
      [7, 14, 30].map(function (r) { return chip(r + "d", range === r, 'data-range="' + r + '"'); }).join("") +
      "</span>";
    var dailyHtml = vdAll.length
      ? '<h2 class="stat-h2">Views \u2014 ' + (W ? esc(winLabel) : "last " + range + " days") +
          ' <span class="stat-sub">(' + vdTotal + " view" + (vdTotal === 1 ? "" : "s") +
          (vdPeak ? " \u00B7 peak " + vdPeak + "/day" : "") + ")</span>" + rangeChips + "</h2>" +
        bars(vd, "stat-chart") +
        (vd.length ? '<div class="stat-chart-axis"><span>' + esc(fmtD(vd[0].d)) + "</span><span>" +
          esc(fmtD(vd[vd.length - 1].d)) + endTag(vd) + "</span></div>" : "")
      : "";

    // New guides per day (from each guide's first-publish date, bucketed into
    // the same viewer-local days as the views chart; follows the range chips)
    var tzOff = new Date().getTimezoneOffset();
    var createdByDay = {};
    (s.guides || []).forEach(function (g) {
      if (!g.created) return;
      var t = Date.parse(g.created);
      if (isNaN(t)) return;
      var d = new Date(t - tzOff * 60000).toISOString().slice(0, 10);
      createdByDay[d] = (createdByDay[d] || 0) + 1;
    });
    var ng = (W ? vdAll : vdAll.slice(-range)).map(function (x) { return { d: x.d, v: createdByDay[x.d] || 0 }; });
    var ngTotal = ng.reduce(function (a, x) { return a + x.v; }, 0);
    var newGuidesHtml = ngTotal
      ? '<h2 class="stat-h2">New guides — ' + (W ? esc(winLabel) : "last " + range + " days") +
          ' <span class="stat-sub">(' + ngTotal + " guide" + (ngTotal === 1 ? "" : "s") + ")</span></h2>" +
        bars(ng, "stat-chart", "guide") +
        '<div class="stat-chart-axis"><span>' + esc(fmtD(ng[0].d)) + "</span><span>" +
          esc(fmtD(ng[ng.length - 1].d)) + endTag(ng) + "</span></div>"
      : "";

    // New accounts per day (exact — straight from the user pool's creation
    // stamps; same axis + range chips as the other timelines)
    var acctsHtml = "";
    if (s.accounts && s.accounts.daily) {
      var ac = W ? s.accounts.daily : s.accounts.daily.slice(-range);
      var acTotal = ac.reduce(function (a, x) { return a + x.v; }, 0);
      if (acTotal) {
        acctsHtml =
          '<h2 class="stat-h2">New accounts — ' + (W ? esc(winLabel) : "last " + range + " days") +
            ' <span class="stat-sub">(' + acTotal + " account" + (acTotal === 1 ? "" : "s") + ")</span></h2>" +
          bars(ac, "stat-chart", "account") +
          '<div class="stat-chart-axis"><span>' + esc(fmtD(ac[0].d)) + "</span><span>" +
            esc(fmtD(ac[ac.length - 1].d)) + endTag(ac) + "</span></div>";
      }
    }

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
    // Windowed funnel: the same 7/14/30 chips as the views chart slice a daily
    // series, so campaign waves (e.g. Facebook posts) can be compared by date.
    var fdAll = W ? [] : (s.funnelDaily || []); // whole page is the window already
    var fd = fdAll.slice(-range);
    var fw = { o: 0, s: 0, dr: 0, t: 0, p: 0, l: 0 };
    fd.forEach(function (x) {
      fw.o += x.o || 0; fw.s += x.s || 0; fw.dr += x.dr || 0;
      fw.t += x.t || 0; fw.p += x.p || 0; fw.l += x.l || 0;
    });
    var windowHtml = !fdAll.length ? "" :
      '<p class="stat-window" id="funnelWindow">Last ' + range + " days: " +
      ((fw.o || fw.s || fw.dr || fw.p)
        ? "<b>" + fw.o + "</b> opened \u2192 <b>" + fw.s + "</b> started \u2192 <b>" + fw.dr +
          "</b> draft" + (fw.dr === 1 ? "" : "s") +
          (fw.t ? " \u2192 <b>" + fw.t + "</b> tried" : "") +
          " \u2192 <b>" + fw.p + "</b> published" + pct(fw.p, fw.o) +
          (fw.l ? " \u00B7 <b>" + fw.l + "</b> via the new flow" : "")
        : "no builder activity in this window.") +
      "</p>";
    var funnelHtml = (fu.opens || fu.starts || fu.drafts || fu.published)
      ? '<h2 class="stat-h2">Creation funnel <span class="stat-sub">(each % is of the step before' +
          (W ? "" : " \u00B7 the \u201Clast N days\u201D line follows the view chips") + ")</span></h2>" +
        '<div class="stat-grid">' +
          statCard("\uD83D\uDEAA", fu.opens || 0, "Builder opened") +
          statCard("\uD83D\uDC46", fu.starts || 0, "Method chosen" + pct(fu.starts, fu.opens)) +
          statCard("\uD83D\uDCDD", fu.drafts || 0, "Drafts built" + pct(fu.drafts, fu.starts)) +
          // "Tried to publish" only exists for events after publish_tap shipped
          (fu.tried ? statCard("\uD83C\uDFAF", fu.tried, "Tried to publish" + pct(fu.tried, fu.drafts)) : "") +
          statCard("\uD83D\uDE80", fu.published || 0, "Published" + pct(fu.published, fu.tried || fu.drafts)) +
          // Live-flow share: only exists once the new scratch flow is deployed
          (fu.live ? statCard("\u26A1", fu.live, "New flow opened" + pct(fu.live, fu.starts)) : "") +
        "</div>" +
        windowHtml +
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
          ? '<div class="stat-guides" id="statGuides">' + list.map(guideCard).join("") + "</div>" +
            '<button type="button" class="stat-chip sg-more" id="sgMore" hidden></button>'
          : '<p class="stat-empty">No guides match \u2014 try turning off the "New this week" filter.</p>');
    } else {
      guidesHtml = '<h2 class="stat-h2">Per-guide breakdown</h2>' +
        '<p class="stat-empty">No guide activity yet \u2014 publish or share a guide to see it here.</p>';
    }

    out.innerHTML = winBar + cards + dailyHtml + newGuidesHtml + acctsHtml + refsHtml + funnelHtml + catsHtml + startHtml + featHtml + guidesHtml +
      '<p class="stat-foot">' +
      (W ? "Every number above answers for " + esc(winLabel) + " only (drafts and publishes count in the window their first event landed in). "
         : "Counts everything since analytics went live. ") +
      "No personal data is collected \u2014 visitors are an anonymous random id in their own browser, so unique counts start from when that shipped. " +
      "Start-method and feature stats only include activity after this update. Daily charts use your local timezone.</p>";

    // Wire the controls (repainted each time)
    var fEl = $("sgFilter");
    if (fEl) {
      fEl.value = q;
      fEl.addEventListener("input", function () { q = this.value; applyNameFilter(); });
    }
    var moreBtn = $("sgMore");
    if (moreBtn) moreBtn.addEventListener("click", function () {
      showAllGuides = !showAllGuides;
      applyNameFilter();
    });
    applyNameFilter();
    Array.prototype.forEach.call(out.querySelectorAll(".stat-chip"), function (c) {
      c.addEventListener("click", function () {
        // Whole-page window chips refetch from the backend for that range.
        var w = c.getAttribute("data-win");
        if (w) {
          if (w === "all") { win = null; winPreset = "all"; }
          else { win = { from: localDayStr(+w - 1), to: localDayStr(0) }; winPreset = w; }
          c.textContent = "…";
          refetch();
          return;
        }
        if (c.getAttribute("data-csv")) { exportCsv(sortedGuides()); return; }
        var r = c.getAttribute("data-range");
        if (r) { range = +r; paint(); return; }
        if (c.getAttribute("data-newonly")) { newOnly = !newOnly; paint(); return; }
        var sKey = c.getAttribute("data-sort");
        if (sKey) { sortKey = sKey; paint(); }
      });
    });
    var wa = $("winApply");
    if (wa) wa.addEventListener("click", function () {
      var f = ($("winFrom").value || "").trim();
      var t = ($("winTo").value || "").trim();
      if (!f && !t) return;
      win = { from: f || t, to: t || f };
      winPreset = "custom";
      wa.textContent = "…";
      refetch();
    });
  }

  // "2026-07-08" -> "8 Jul"
  function fmtD(d) {
    var p = String(d).split("-");
    var M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return (+p[2]) + " " + (M[+p[1] - 1] || "");
  }
  // Daily bars: single brand hue, zero days as baseline stubs, today
  // emphasised, per-bar value in a native tooltip. `unit` names what the
  // numbers are ("view" by default; "guide" for the new-guides chart).
  function bars(daily, cls, unit) {
    unit = unit || "view";
    var max = 0;
    daily.forEach(function (x) { if (x.v > max) max = x.v; });
    var out = '<div class="' + cls + '" aria-hidden="true">';
    daily.forEach(function (x, i) {
      var last = i === daily.length - 1;
      var h = x.v && max ? Math.max(8, Math.round(x.v / max * 100)) + "%" : "2px";
      var tip = esc(fmtD(x.d)) + " \u2014 " + x.v + " " + unit + (x.v === 1 ? "" : "s") +
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
      // Sparkline follows the chart chips (all-time mode) or spans the window.
      (g.daily ? bars(winActive ? g.daily : g.daily.slice(-range), "sg-daily") : "") +
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

  // "  (42%)" — a small share label; empty when there's nothing to divide by,
  // or when n > total (funnel steps started tracking at different times, so a
  // young step can be smaller than an old one — a >100% funnel is noise).
  function pct(n, total) {
    if (!total || !n || n > total) return "";
    return " (" + Math.round((n / total) * 100) + "%)";
  }

  function statCard(emoji, num, label) {
    return '<div class="stat-card"><div class="stat-emoji">' + emoji + "</div>" +
      '<div class="stat-num">' + num + "</div>" +
      '<div class="stat-label">' + label + "</div></div>";
  }

  /* ---- broadcast email composer (own container; never repainted) ---- */
  var bcastKey = "";     // held after unlock so sends reuse the passphrase
  var bcastTotal = 0;    // full audience size from the audience check

  // Recipient picker: everyone ticked by default; untick to narrow a send
  // (e.g. just yourself + a friend for a dry run). The server re-checks the
  // selection against the live audience, so this is convenience, not access.
  function pickedEmails() {
    var boxes = document.querySelectorAll("#bcastRecipList input[type=checkbox]");
    var on = [];
    Array.prototype.forEach.call(boxes, function (b) { if (b.checked) on.push(b.getAttribute("data-em")); });
    return on;
  }
  function syncPicker() {
    var send = $("bcastSendBtn");
    var pick = $("bcastPick");
    if (!pick || pick.hidden) {
      // No labelled list (older backend): whole-audience sends only.
      send.disabled = !bcastTotal;
      send.textContent = bcastTotal ? "Send to " + bcastTotal + " " + (bcastTotal === 1 ? "person" : "people") : "Send";
      return;
    }
    var sel = pickedEmails().length;
    var all = $("bcastAll");
    if (all) all.checked = sel === bcastTotal;
    $("bcastPickSummary").textContent = "Choose recipients (" + sel + " of " + bcastTotal + " selected)";
    send.disabled = !sel;
    send.textContent = sel ? "Send to " + sel + " " + (sel === 1 ? "person" : "people") : "Send";
  }
  function buildRecipientPicker(emails) {
    var pick = $("bcastPick");
    if (!pick || !emails.length) { syncPicker(); return; }
    pick.hidden = false;
    $("bcastRecipList").innerHTML = emails.map(function (r) {
      return '<label class="bcast-recip"><input type="checkbox" checked data-em="' + esc(r.email) + '" /> ' +
        esc(r.email) + ' <span class="bcast-src">' + (r.src === "waitlist" ? "waitlist" : "account") + "</span></label>";
    }).join("");
    $("bcastRecipList").addEventListener("change", syncPicker);
    $("bcastAll").addEventListener("change", function () {
      var on = this.checked;
      Array.prototype.forEach.call(document.querySelectorAll("#bcastRecipList input[type=checkbox]"),
        function (b) { b.checked = on; });
      syncPicker();
    });
    syncPicker();
  }

  function bcastSay(kind, msg) {
    var n = $("bcastNote");
    n.hidden = false;
    n.style.color = kind === "ok" ? "#1B7F4B" : "";
    n.textContent = msg;
  }

  function initBroadcast(key) {
    bcastKey = key;
    var box = $("bcast");
    if (!box || !box.hidden) return; // already initialised
    box.hidden = false;
    GotItStore.broadcast({ key: key, action: "audience" }).then(function (a) {
      if (!a) { $("bcastWho").textContent = "Email backend isn't available here."; return; }
      bcastTotal = a.total || 0;
      $("bcastWho").textContent = bcastTotal
        ? "Goes to " + bcastTotal + " " + (bcastTotal === 1 ? "person" : "people") + " — " +
          (a.accounts || 0) + " account holder" + (a.accounts === 1 ? "" : "s") + " + " +
          (a.waitlist || 0) + " waitlist" +
          (a.unsubscribed ? " (" + a.unsubscribed + " unsubscribed, excluded)" : "") +
          ". Every email includes your identity and an unsubscribe link."
        : "Nobody to email yet — accounts and waitlist signups will appear here.";
      buildRecipientPicker(a.emails || []);
    }).catch(function () {
      $("bcastWho").textContent = "Couldn't check the audience — try reloading.";
    });

    $("bcastTestBtn").addEventListener("click", function () {
      var to = ($("bcastTestTo").value || "").trim();
      var subject = ($("bcastSubject").value || "").trim();
      var body = ($("bcastBody").value || "").trim();
      if (!subject || !body) { bcastSay("err", "Write a subject and a message first."); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { bcastSay("err", "Enter your own address for the test."); return; }
      var btn = $("bcastTestBtn");
      btn.disabled = true; btn.textContent = "Sending…";
      GotItStore.broadcast({ key: bcastKey, action: "test", to: to, subject: subject, body: body })
        .then(function () { bcastSay("ok", "Test sent to " + to + " — check it (and the unsubscribe link) before the real send."); })
        .catch(function (e) { bcastSay("err", "Test failed: " + (e && e.message || "unknown error")); })
        .then(function () { btn.disabled = false; btn.textContent = "Send test to me"; });
    });

    $("bcastSendBtn").addEventListener("click", function () {
      var subject = ($("bcastSubject").value || "").trim();
      var body = ($("bcastBody").value || "").trim();
      if (!subject || !body) { bcastSay("err", "Write a subject and a message first."); return; }
      var pickerOn = $("bcastPick") && !$("bcastPick").hidden;
      var sel = pickerOn ? pickedEmails() : [];
      var n = pickerOn ? sel.length : bcastTotal;
      if (!n) { bcastSay("err", "Pick at least one recipient."); return; }
      if (!confirm("Send this email to " + n + " " + (n === 1 ? "person" : "people") + "? This can't be undone.")) return;
      var btn = $("bcastSendBtn");
      btn.disabled = true; btn.textContent = "Sending…";
      var payload = { key: bcastKey, action: "send", subject: subject, body: body };
      if (pickerOn && sel.length !== bcastTotal) payload.only = sel; // subset send
      GotItStore.broadcast(payload)
        .then(function (r) {
          if (r && r.failed) bcastSay("err", "Sent to " + r.sent + " of " + r.total + " — " + r.failed + " failed. Try again later for the rest.");
          else bcastSay("ok", "Sent to " + (r && r.sent || 0) + " " + ((r && r.sent) === 1 ? "person" : "people") + " 🎉");
        })
        .catch(function (e) { bcastSay("err", "Send failed: " + (e && e.message || "unknown error")); })
        .then(function () { btn.disabled = false; syncPicker(); });
    });
  }

  function go() {
    var key = ($("statsKey").value || "").trim();
    if (!key) return;
    var btn = $("statsGo"), err = $("statsErr");
    err.hidden = true;
    btn.disabled = true; btn.textContent = "Loading…";
    GotItStore.stats(key, win).then(function (s) {
      if (!s) { err.textContent = "Stats backend isn't available here (publish online to use it)."; err.hidden = false; }
      else { statsKeyVal = key; render(s); initBroadcast(key); startAutoRefresh(key); }
    }).catch(function () {
      err.textContent = "Wrong passphrase, or stats aren't configured yet.";
      err.hidden = false;
    }).then(function () { btn.disabled = false; btn.textContent = "View stats"; });
  }

  // Silent refresh every 3 minutes while the tab is visible, so a day of
  // watching the page never shows stale numbers. Skipped while typing (a
  // repaint would blur the filter box); chip/sort/range state is module-level
  // so it survives every repaint.
  var refreshTimer = null;
  function startAutoRefresh(key) {
    if (refreshTimer) return;
    refreshTimer = setInterval(function () {
      if (document.hidden) return;
      var ae = document.activeElement;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) return;
      // Refreshes honour whatever window is active at the time.
      GotItStore.stats(key, win).then(function (s) { if (s) render(s); })
        .catch(function () { /* keep showing the last good numbers */ });
    }, 180000);
  }

  $("statsGo").addEventListener("click", go);
  $("statsKey").addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
  setTimeout(function () { $("statsKey").focus(); }, 50);
})();
