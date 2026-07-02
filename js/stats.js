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

    var top = (s.topGuides || []).filter(function (g) { return g.views; });
    var topHtml = top.length
      ? '<h2 class="stat-h2">Most viewed guides</h2><ol class="stat-list">' +
          top.map(function (g) {
            return '<li><a href="/g/' + encodeURIComponent(g.slug) + '" target="_blank" rel="noopener">' +
              esc(g.slug) + "</a><span>" + g.views + " views</span></li>";
          }).join("") +
        "</ol>"
      : '<p class="stat-empty">No guide views yet — share a guide link to see it here.</p>';

    out.innerHTML = cards + startHtml + featHtml + topHtml +
      '<p class="stat-foot">Counts everything since analytics went live. No personal data is collected. ' +
      "Start-method and feature stats only include activity after this update.</p>";
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
