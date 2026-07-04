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

  function render(s) {
    $("statsGate").hidden = true;
    var out = $("statsOut");
    out.hidden = false;

    var cards =
      '<div class="stat-grid">' +
        statCard("📘", s.publishes || 0, "Guides published") +
        statCard("👀", s.views || 0, "Guide views") +
        statCard("🔗", s.shares || 0, "Shares") +
      "</div>";

    // How guides are started (Talk / Paste / Scratch)
    var sm = s.startMethods || {};
    var startTotal = (sm.talk || 0) + (sm.paste || 0) + (sm.scratch || 0);
    var startHtml = startTotal
      ? '<h2 class="stat-h2">How guides are started</h2><div class="stat-grid">' +
          statCard("🎙️", sm.talk || 0, "Talk it out" + pct(sm.talk, startTotal)) +
          statCard("📋", sm.paste || 0, "Paste notes" + pct(sm.paste, startTotal)) +
          statCard("✍️", sm.scratch || 0, "From scratch" + pct(sm.scratch, startTotal)) +
        "</div>"
      : "";

    // Features used across published guides (share of all publishes)
    var f = s.features || {};
    var pub = s.publishes || 0;
    var featRows = [
      ["📸", "photo", "Photos"], ["🎬", "video", "Videos"], ["🖼️", "cover", "Cover photo"],
      ["⏰", "routine", "Daily routine"], ["📓", "log", "Logs"], ["🔒", "lock", "Locked"],
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

    // Per-guide breakdown: each guide's own views / shares / publishes / features.
    var guides = s.guides || [];
    var guidesHtml;
    if (guides.length) {
      var filter = guides.length > 6
        ? '<input type="search" id="sgFilter" class="stat-filter" placeholder="Filter guides by name…" autocomplete="off" />'
        : "";
      guidesHtml = '<h2 class="stat-h2">Per-guide breakdown <span class="stat-sub">(' + guides.length + ')</span></h2>' +
        filter + '<div class="stat-guides" id="statGuides">' +
        guides.map(guideCard).join("") + "</div>";
    } else {
      guidesHtml = '<h2 class="stat-h2">Per-guide breakdown</h2>' +
        '<p class="stat-empty">No guide activity yet — publish or share a guide to see it here.</p>';
    }

    out.innerHTML = cards + startHtml + featHtml + guidesHtml +
      '<p class="stat-foot">Counts everything since analytics went live. No personal data is collected. ' +
      "Start-method and feature stats only include activity after this update.</p>";

    var fEl = $("sgFilter");
    if (fEl) fEl.addEventListener("input", function () {
      var q = this.value.trim().toLowerCase();
      Array.prototype.forEach.call($("statGuides").children, function (c) {
        var slug = (c.getAttribute("data-slug") || "").toLowerCase();
        c.style.display = (!q || slug.indexOf(q) >= 0) ? "" : "none";
      });
    });
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
    return '<div class="sg-card" data-slug="' + esc(g.slug) + '">' +
      '<div class="sg-top">' +
        '<a class="sg-name" href="/g/' + encodeURIComponent(g.slug) + '" target="_blank" rel="noopener">' + esc(g.slug) + "</a>" +
        (when ? '<span class="sg-when">' + esc(when) + "</span>" : "") +
      "</div>" +
      '<div class="sg-metrics">' +
        metric("👀", g.views, "views") + metric("🔗", g.shares, "shares") + metric("📘", g.publishes, "publishes") +
      "</div>" +
      (feats ? '<div class="sg-feats">' + feats + "</div>" : "") +
    "</div>";
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
