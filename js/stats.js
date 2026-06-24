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

    var top = (s.topGuides || []).filter(function (g) { return g.views; });
    var topHtml = top.length
      ? '<h2 class="stat-h2">Most viewed guides</h2><ol class="stat-list">' +
          top.map(function (g) {
            return '<li><a href="/g/' + encodeURIComponent(g.slug) + '" target="_blank" rel="noopener">' +
              esc(g.slug) + "</a><span>" + g.views + " views</span></li>";
          }).join("") +
        "</ol>"
      : '<p class="stat-empty">No guide views yet — share a guide link to see it here.</p>';

    out.innerHTML = cards + topHtml +
      '<p class="stat-foot">Counts everything since analytics went live. No personal data is collected.</p>';
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
