/* ============================================================
   How2 — Published guide view (read-only)
   Loads a guide from localStorage by ?g=slug and renders it
   in the same style as the builder preview.
   ============================================================ */
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function getSlug() {
    var m = location.search.match(/[?&]g=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function loadGuide(slug) {
    try {
      var all = JSON.parse(localStorage.getItem("how2_guides") || "{}");
      return all[slug] || null;
    } catch (e) { return null; }
  }
  // turn "tel"-like values into links
  function linkify(value) {
    var safe = esc(value);
    var phone = value.match(/(\+?[\d][\d\s().-]{6,}\d)/);
    if (phone) {
      var tel = phone[1].replace(/[^\d+]/g, "");
      safe = safe.replace(phone[1], '<a href="tel:' + tel + '">' + esc(phone[1]) + "</a>");
    }
    return safe;
  }

  var doc = document.getElementById("guideDoc");
  var footer = document.getElementById("guideFooter");
  var slug = getSlug();
  var guide = slug ? loadGuide(slug) : null;

  if (!guide) {
    doc.innerHTML =
      '<div class="guide-cover"><span class="cover-emoji">🔍</span>' +
      '<div class="cover-title">Guide not found</div>' +
      '<div class="cover-sub">This guide may have been created on another device or browser.</div></div>' +
      '<p style="text-align:center;margin-top:24px"><a class="btn btn-primary" href="builder.html">Create a guide →</a></p>';
    document.title = "Guide not found — How2";
    return;
  }

  document.title = guide.title + " — How2";

  var html = "";

  // Cover
  html +=
    '<div class="guide-cover">' +
      '<span class="cover-emoji">' + guide.emoji + "</span>" +
      '<div class="cover-title">' + esc(guide.title) + "</div>" +
      '<div class="cover-sub">' + esc(guide.subtitle) + "</div>" +
    "</div>";

  // ---- Block renderers ----
  var firstSectionOpen = true;
  function sectionHtml(sec) {
    var media = "";
    if (sec.photo) media += '<div class="sec-media"><img class="sec-photo" src="' + sec.photo + '" alt="" /></div>';
    if (sec.videoId) {
      media += '<div class="sec-media"><div class="sec-video"><iframe src="https://www.youtube.com/embed/' +
        sec.videoId + '" allowfullscreen loading="lazy"></iframe></div></div>';
    }
    var open = firstSectionOpen ? " open" : "";
    firstSectionOpen = false;
    return '<div class="guide-section' + open + '">' +
        '<button class="acc-header" type="button">' +
          '<span class="acc-icon">' + sec.icon + "</span>" +
          '<span class="acc-title-text">' + esc(sec.title) + "</span>" +
          '<span class="acc-chevron">▾</span>' +
        "</button>" +
        '<div class="acc-body"><div class="acc-body-inner">' +
          '<div class="acc-content">' + esc(sec.body) + "</div>" +
          media +
        "</div></div>" +
      "</div>";
  }
  function emergencyHtml() {
    if (!(guide.contacts && guide.contacts.length)) return "";
    var s = '<div class="guide-emergency"><div class="em-head">🚨 Emergency Contacts</div>';
    guide.contacts.forEach(function (c) {
      s += '<div class="contact-row">' +
          '<span class="contact-label">' + esc(c.label) + "</span>" +
          '<span class="contact-value">' + linkify(c.value) + "</span>" +
        "</div>";
    });
    return s + "</div>";
  }
  function logHtml(log) {
    var s = '<div class="guide-log"><div class="log-head">📓 ' + esc(log.title) + "</div>";
    s += '<table class="log-table"><thead><tr><th>Date / time</th><th>Note</th></tr></thead><tbody>';
    (log.rows || []).forEach(function (r) {
      if (!r.when && !r.note) return;
      s += "<tr><td>" + esc(r.when) + "</td><td>" + esc(r.note) + "</td></tr>";
    });
    return s + "</tbody></table></div>";
  }
  function byId(list, id) {
    list = list || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  // ---- Render blocks in saved order (fall back to a sensible default) ----
  var order = guide.blockOrder && guide.blockOrder.length ? guide.blockOrder.slice() : null;
  if (!order) {
    order = (guide.sections || []).map(function (s) { return "s:" + s.id; });
    order.push("e");
    (guide.logs || []).forEach(function (l) { order.push("l:" + l.id); });
  }
  var done = {};
  order.forEach(function (tok) {
    if (tok === "e") { html += emergencyHtml(); done.e = true; }
    else if (tok.indexOf("s:") === 0) {
      var sec = byId(guide.sections, tok.slice(2));
      if (sec) { html += sectionHtml(sec); done[tok] = true; }
    } else if (tok.indexOf("l:") === 0) {
      var log = byId(guide.logs, tok.slice(2));
      if (log) { html += logHtml(log); done[tok] = true; }
    }
  });
  // Reconcile anything missing from the order
  (guide.sections || []).forEach(function (sec) { if (!done["s:" + sec.id]) html += sectionHtml(sec); });
  if (!done.e) html += emergencyHtml();
  (guide.logs || []).forEach(function (log) { if (!done["l:" + log.id]) html += logHtml(log); });

  doc.innerHTML = html;

  // Cover photo (set via JS to avoid escaping the data URL in an attribute)
  if (guide.cover) {
    var coverEl = doc.querySelector(".guide-cover");
    if (coverEl) {
      coverEl.classList.add("has-cover");
      coverEl.style.backgroundImage =
        "linear-gradient(180deg, rgba(26,26,26,0.28), rgba(26,26,26,0.55)), url(" + guide.cover + ")";
    }
  }

  // Accordion behaviour
  doc.querySelectorAll(".guide-section").forEach(function (sec) {
    sec.querySelector(".acc-header").addEventListener("click", function () {
      sec.classList.toggle("open");
    });
  });

  // Footer (How2 branding for free tier)
  if (guide.branding !== false) {
    footer.innerHTML = 'Made with <a href="index.html">How2</a> · The guide you always meant to write';
  } else {
    footer.innerHTML = "";
  }
})();
