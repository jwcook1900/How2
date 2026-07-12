/* ============================================================
   GotIt Guides — "My Guides" dashboard
   Lightweight management for a signed-in user's saved guides:
   greeting by name, informative guide cards (status, lock state,
   last updated) with primary actions + a "More" menu, optional
   search, minimal account settings, and a soft teaser for what's
   coming. Creating/publishing guides never needs any of this.
   ============================================================ */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var PENDING_KEY = "gotit_pending_save";

  var idTok = null;     // Cognito id token (for AppSync)
  var user = null;      // { sub, email, name } from the token
  var profile = null;   // { id, displayName }
  var guides = [];      // SavedGuide rows
  var suggestions = []; // GuideFeedback rows (sitter suggestions)
  var gstats = {};      // per-slug analytics: { views, shares, week, daily[] }
  var isNewUser = false; // true on the first sign-in (no profile yet)

  /* ---------- helpers ---------- */
  function viewUrl(slug) { return location.origin + "/g/" + encodeURIComponent(slug); }
  function editUrl(slug, token) {
    return "builder.html?g=" + encodeURIComponent(slug) + "&t=" + encodeURIComponent(token);
  }
  function firstName(name) { return String(name || "").trim().split(/\s+/)[0]; }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function randSuffix() { return Math.random().toString(36).slice(2, 6); }
  function randToken() {
    var a = new Uint8Array(16); window.crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  function feedbackFor(slug) {
    return suggestions.filter(function (s) { return s.slug === slug; });
  }
  // "2026-07-08" -> "8 Jul"
  function fmtDay(d) {
    var p = String(d).split("-");
    var M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return (+p[2]) + " " + (M[+p[1] - 1] || "");
  }
  // Daily-views bars: single series in the brand hue; zero days show as
  // baseline stubs; today is emphasised; each bar carries its value in a
  // native tooltip.
  function barsHtml(daily, cls) {
    var max = 0;
    daily.forEach(function (x) { if (x.v > max) max = x.v; });
    var s = '<div class="' + cls + '" aria-hidden="true">';
    daily.forEach(function (x, i) {
      var last = i === daily.length - 1;
      var h = x.v && max ? Math.max(10, Math.round(x.v / max * 100)) + "%" : "2px";
      var tip = esc(fmtDay(x.d)) + " \u2014 " + x.v + " view" + (x.v === 1 ? "" : "s") +
        (x.u ? " \u00B7 " + x.u + " visitor" + (x.u === 1 ? "" : "s") : "");
      s += '<i class="' + (x.v ? "" : "z") + (last ? " today" : "") +
        '" style="height:' + h + '" title="' + tip + '"></i>';
    });
    return s + "</div>";
  }

  /* ---------- per-guide analytics window ---------- */
  function openStatsModal(g) {
    closeStatsModal();
    var st = gstats[g.slug] || { views: 0, shares: 0, week: 0, daily: [] };
    var gname = (g.title || "").trim() || "Untitled guide";

    var overlay = document.createElement("div");
    overlay.className = "dash-fb-overlay";
    overlay.id = "dashAnOverlay";
    var modal = document.createElement("div");
    modal.className = "dash-fb-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");

    var head = document.createElement("div");
    head.className = "dash-fb-head";
    head.innerHTML = '<div class="dash-fb-title">' +
        '<span class="dash-fb-emoji">\uD83D\uDCCA</span>' +
        '<span>Analytics for \u201C' + esc(gname) + '\u201D</span>' +
      "</div>";
    var close = document.createElement("button");
    close.type = "button"; close.className = "dash-fb-close";
    close.setAttribute("aria-label", "Close"); close.textContent = "\u2715";
    close.addEventListener("click", closeStatsModal);
    head.appendChild(close);

    var body = document.createElement("div");
    body.className = "dash-an-body";
    function tile(n, label) {
      return '<div class="dash-an-num"><b>' + n + "</b><span>" + label + "</span></div>";
    }
    var daily = st.daily || [];
    var chart = daily.length && st.views
      ? '<div class="dash-an-label">Daily views \u2014 last 14 days</div>' +
        barsHtml(daily, "dash-an-chart") +
        '<div class="dash-an-axis"><span>' + esc(fmtDay(daily[0].d)) + "</span><span>" +
          esc(fmtDay(daily[daily.length - 1].d)) + " (today)</span></div>"
      : '<p class="dash-an-empty">No views yet \u2014 share the link and check back here.</p>';
    // Top traffic sources (referrer domains; "direct" = typed/app/no referrer)
    var refs = st.refs || {};
    var refKeys = Object.keys(refs).sort(function (a, b) { return refs[b] - refs[a]; }).slice(0, 3);
    var srcs = refKeys.length
      ? '<div class="dash-an-label" style="margin-top:16px">Where views come from</div>' +
        '<div class="dash-an-srcs">' + refKeys.map(function (k) {
          return '<span class="dash-an-src">' + (k === "direct" ? "\uD83D\uDD17 direct" : "\uD83C\uDF10 " + esc(k)) +
            " <b>" + refs[k] + "</b></span>";
        }).join("") + "</div>"
      : "";
    body.innerHTML =
      '<div class="dash-an-nums">' +
        tile(st.views || 0, "total views") +
        tile(st.unique || 0, "unique visitors") +
        tile(st.week || 0, "this week") +
        tile(st.shares || 0, "shares") +
      "</div>" + chart + srcs +
      '<p class="dash-an-foot">Counted since analytics went live \u00B7 days in your timezone</p>';

    modal.appendChild(head);
    modal.appendChild(body);
    overlay.appendChild(modal);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeStatsModal(); });
    document.body.appendChild(overlay);
  }
  function closeStatsModal() {
    var o = $("dashAnOverlay");
    if (o && o.parentNode) o.parentNode.removeChild(o);
  }
  function relTime(iso) {
    if (!iso) return "";
    var then = new Date(iso).getTime();
    if (isNaN(then)) return "";
    var diff = Date.now() - then, day = 86400000, d = Math.floor(diff / day);
    if (diff < 60000) return "just now";
    if (d <= 0) return "today";
    if (d === 1) return "yesterday";
    if (d < 7) return d + " days ago";
    if (d < 14) return "last week";
    if (d < 30) return Math.floor(d / 7) + " weeks ago";
    if (d < 60) return "last month";
    if (d < 365) return Math.floor(d / 30) + " months ago";
    var y = Math.floor(d / 365); return y + " year" + (y > 1 ? "s" : "") + " ago";
  }
  function getPending() {
    try { return JSON.parse(localStorage.getItem(PENDING_KEY) || "null"); } catch (e) { return null; }
  }
  function clearPending() { localStorage.removeItem(PENDING_KEY); }

  function toast(msg) {
    var t = document.createElement("div");
    t.className = "dash-toast"; t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(function () {
      t.classList.remove("show");
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
    }, 2300);
  }
  function copyText(text, okMsg) {
    function done() { toast(okMsg || "Copied!"); }
    function legacy() {
      var ta = document.createElement("textarea"); ta.value = text;
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta); done();
    }
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, legacy);
    else legacy();
  }

  function showOnly(id) {
    ["dashLoading", "dashSignin", "dashGuides"].forEach(function (k) {
      var el = $(k); if (el) el.hidden = (k !== id);
    });
  }
  function showSignin(note) {
    showOnly("dashSignin");
    $("settingsBtn").hidden = true;
    $("dashCreateTop").hidden = true;
    if (note) { $("dashSigninNote").textContent = note; $("dashSigninNote").hidden = false; }
  }

  /* ---------- greeting + display name ---------- */
  function applyGreeting() {
    var stored = profile && profile.displayName;
    var tokenName = (user && user.name && user.name !== user.email) ? user.name : null;
    var name = stored || tokenName;
    if (name) {
      $("dashGreeting").textContent = "Hi " + firstName(name) + " 👋";
      $("namePrompt").hidden = true;
      // Persist a name we got from the IdP so it's stored + editable in settings.
      // Skipped for a brand-new user — load() already created their profile
      // (avoids a duplicate-create race).
      if (!stored && tokenName && !isNewUser) {
        GotItStore.saveProfile(idTok, tokenName).then(function (p) { profile = p; }).catch(function () {});
      }
    } else {
      $("dashGreeting").textContent = "Welcome 👋";
      $("namePrompt").hidden = false;
    }
  }

  /* ---------- guide cards ---------- */
  function badge(text, cls) {
    var s = document.createElement("span");
    s.className = "dash-badge " + cls;
    s.textContent = text;
    return s;
  }

  function buildMenu(g, cardEl) {
    var published = (g.status || "published") === "published";
    var menu = document.createElement("div");
    menu.className = "dash-menu";

    function item(label, fn, danger) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "dash-menu-item" + (danger ? " danger" : "");
      b.textContent = label;
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        menu.classList.remove("open");
        fn();
      });
      menu.appendChild(b);
    }

    item("Rename", function () { renameGuide(g, cardEl); });
    item("Duplicate", function () { duplicateGuide(g); });
    // Share-related actions only make sense once a public link exists.
    if (published) {
      item("Change link…", function () { changeLink(g); });
      item("Copy share link", function () { copyText(viewUrl(g.slug), "Share link copied!"); });
      item("Download QR", function () { downloadQR(g); });
    }
    var hr = document.createElement("div"); hr.className = "dash-menu-sep"; menu.appendChild(hr);
    item("Delete", function () { deleteGuide(g, cardEl); }, true);
    return menu;
  }

  function card(g) {
    var published = (g.status || "published") === "published";
    var el = document.createElement("div");
    el.className = "dash-card";
    el.setAttribute("data-id", g.id);
    el.setAttribute("data-title", g.title || "");

    // More menu (top-right)
    var moreWrap = document.createElement("div");
    moreWrap.className = "dash-card-more-wrap";
    var moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "dash-card-more";
    moreBtn.setAttribute("aria-label", "More actions");
    moreBtn.textContent = "⋯";
    var menu = buildMenu(g, el);
    moreBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = menu.classList.contains("open");
      closeMenus();
      if (!open) menu.classList.add("open");
    });
    moreWrap.appendChild(moreBtn);
    moreWrap.appendChild(menu);

    // Main (emoji + title) links to the guide
    var main = document.createElement("a");
    main.className = "dash-card-main";
    main.href = viewUrl(g.slug); main.target = "_blank"; main.rel = "noopener";
    var emoji = document.createElement("span");
    emoji.className = "dash-card-emoji"; emoji.textContent = g.emoji || "📘";
    var title = document.createElement("div");
    title.className = "dash-card-title"; title.textContent = g.title || "Untitled guide";
    main.appendChild(emoji); main.appendChild(title);

    // Badges + updated
    var meta = document.createElement("div");
    meta.className = "dash-card-meta";
    meta.appendChild(badge(published ? "Published" : "Draft", published ? "is-pub" : "is-draft"));
    meta.appendChild(badge(g.locked ? "🔒 Code locked" : "🔗 Public link", g.locked ? "is-locked" : "is-public"));

    var updated = document.createElement("div");
    updated.className = "dash-card-updated";
    var rt = relTime(g.updatedAt || g.createdAt);
    updated.textContent = rt ? "Updated " + rt : "";

    // Primary actions
    var actions = document.createElement("div");
    actions.className = "dash-card-actions";
    var edit = document.createElement("a");
    edit.className = "btn btn-ghost btn-sm"; edit.href = editUrl(g.slug, g.editToken); edit.textContent = "Edit";
    actions.appendChild(edit);
    if (published) {
      var view = document.createElement("a");
      view.className = "btn btn-ghost btn-sm"; view.href = viewUrl(g.slug);
      view.target = "_blank"; view.rel = "noopener"; view.textContent = "View ↗";
      actions.appendChild(view);
      var share = document.createElement("button");
      share.className = "btn btn-ghost btn-sm"; share.type = "button"; share.textContent = "Share";
      share.addEventListener("click", function () { shareGuide(g); });
      actions.appendChild(share);
    }
    // Collaborate: share the edit link so a partner/co-carer can co-edit.
    var collab = document.createElement("button");
    collab.className = "btn btn-ghost btn-sm"; collab.type = "button";
    collab.innerHTML = "👥 Collaborate";
    collab.addEventListener("click", function () { openCollaborateModal(g); });
    actions.appendChild(collab);

    el.appendChild(moreWrap);
    el.appendChild(main);
    el.appendChild(meta);
    el.appendChild(updated);
    el.appendChild(actions);
    // Analytics chip: cards stay clean — the numbers live in a per-guide
    // stats window (only offered once stats have loaded).
    if (Object.keys(gstats).length) {
      var st = gstats[g.slug];
      var an = document.createElement("button");
      an.type = "button";
      an.className = "dash-card-chip dash-card-an";
      an.innerHTML = "\uD83D\uDCCA " + (st && st.views
        ? "<b>" + st.views + "</b>&nbsp;view" + (st.views === 1 ? "" : "s")
        : "Stats");
      an.addEventListener("click", function (e) { e.stopPropagation(); openStatsModal(g); });
      el.appendChild(an);
    }

    // Sitter feedback (persistent, per guide). Only shown when there's at least
    // one note; opens a list you can read/reply-to/delete without it vanishing.
    var fb = feedbackFor(g.slug);
    if (fb.length) {
      var fbBtn = document.createElement("button");
      fbBtn.type = "button";
      fbBtn.className = "dash-card-chip dash-card-feedback";
      fbBtn.innerHTML = '💬 <span class="dcf-label">Feedback</span> ' +
        '<span class="dcf-count">' + fb.length + "</span>";
      fbBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        openFeedbackModal(g);
      });
      el.appendChild(fbBtn);
    }
    return el;
  }

  /* ---------- per-guide feedback ---------- */
  function openFeedbackModal(g) {
    closeFeedbackModal();
    var overlay = document.createElement("div");
    overlay.className = "dash-fb-overlay";
    overlay.id = "dashFbOverlay";

    var modal = document.createElement("div");
    modal.className = "dash-fb-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");

    var head = document.createElement("div");
    head.className = "dash-fb-head";
    var gname = (g.title || "").trim();
    var titleText = gname
      ? 'Feedback on your guide “' + esc(gname) + '”'
      : "Feedback on your guide";
    head.innerHTML = '<div class="dash-fb-title">' +
        '<span class="dash-fb-emoji">' + esc(g.emoji || "📘") + "</span>" +
        "<span>" + titleText + "</span>" +
      "</div>";
    var close = document.createElement("button");
    close.type = "button"; close.className = "dash-fb-close";
    close.setAttribute("aria-label", "Close"); close.textContent = "✕";
    close.addEventListener("click", closeFeedbackModal);
    head.appendChild(close);

    var list = document.createElement("div");
    list.className = "dash-fb-list";

    function renderList() {
      var items = feedbackFor(g.slug);
      list.innerHTML = "";
      if (!items.length) {
        list.innerHTML = '<div class="dash-fb-empty">No feedback yet. ' +
          "When a sitter leaves a suggestion on this guide, it’ll show up here.</div>";
        var chip = document.querySelector('.dash-card[data-id="' + g.id + '"] .dash-card-feedback');
        if (chip && chip.parentNode) chip.parentNode.removeChild(chip);
        return;
      }
      items.forEach(function (s) {
        var row = document.createElement("div");
        row.className = "dash-fb-item";
        var reply = s.fromEmail
          ? '<a class="dash-fb-reply" href="mailto:' + esc(s.fromEmail) +
              "?subject=" + encodeURIComponent("Re: your note on " + (g.title || "my guide")) +
              '">Reply</a>'
          : "";
        row.innerHTML =
          '<div class="dash-fb-item-main">' +
            '<div class="dash-fb-msg">' + esc(s.message) + "</div>" +
            '<div class="dash-fb-meta">' +
              (s.fromEmail ? 'from ' + esc(s.fromEmail) + " · " : "") +
              esc(relTime(s.createdAt)) +
            "</div>" +
          "</div>" +
          '<div class="dash-fb-item-actions">' + reply +
            '<button class="dash-fb-del" type="button" title="Delete" aria-label="Delete">✕</button>' +
          "</div>";
        row.querySelector(".dash-fb-del").addEventListener("click", function () {
          if (!window.confirm("Delete this note? This can't be undone.")) return;
          row.style.opacity = "0.5";
          GotItStore.dismissGuideFeedback(s.id).then(function () {
            suggestions = suggestions.filter(function (x) { return x.id !== s.id; });
            renderList();
            refreshCardChip(g);
          }).catch(function () { row.style.opacity = ""; toast("Couldn't delete that just now."); });
        });
        list.appendChild(row);
      });
    }
    renderList();

    modal.appendChild(head);
    modal.appendChild(list);
    overlay.appendChild(modal);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeFeedbackModal(); });
    document.body.appendChild(overlay);
  }
  function closeFeedbackModal() {
    var o = $("dashFbOverlay");
    if (o && o.parentNode) o.parentNode.removeChild(o);
  }
  // Keep a card's feedback chip count in step after a delete (removes it at 0).
  function refreshCardChip(g) {
    var cardEl = document.querySelector('.dash-card[data-id="' + g.id + '"]');
    if (!cardEl) return;
    var n = feedbackFor(g.slug).length;
    var chip = cardEl.querySelector(".dash-card-feedback");
    if (!n) { if (chip && chip.parentNode) chip.parentNode.removeChild(chip); return; }
    var cnt = chip && chip.querySelector(".dcf-count");
    if (cnt) cnt.textContent = n;
  }

  /* ---------- collaborate (share edit access) ---------- */
  // The edit link is itself the edit credential — anyone with it can edit the
  // guide. Sharing it is the lightweight way for a couple/co-carers to co-edit.
  function collabEditUrl(g) { return location.origin + "/" + editUrl(g.slug, g.editToken); }

  function openCollaborateModal(g) {
    closeCollaborateModal();
    var link = collabEditUrl(g);
    var gname = (g.title || "").trim();

    var overlay = document.createElement("div");
    overlay.className = "dash-fb-overlay";
    overlay.id = "dashCollabOverlay";

    var modal = document.createElement("div");
    modal.className = "dash-fb-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");

    var head = document.createElement("div");
    head.className = "dash-fb-head";
    head.innerHTML = '<div class="dash-fb-title">' +
        '<span class="dash-fb-emoji">👥</span>' +
        "<span>" + (gname ? 'Collaborate on “' + esc(gname) + '”' : "Collaborate on this guide") + "</span>" +
      "</div>";
    var close = document.createElement("button");
    close.type = "button"; close.className = "dash-fb-close";
    close.setAttribute("aria-label", "Close"); close.textContent = "✕";
    close.addEventListener("click", closeCollaborateModal);
    head.appendChild(close);

    var body = document.createElement("div");
    body.className = "dash-collab-body";
    body.innerHTML =
      '<p class="dash-collab-lead">Send this edit link to your partner or co-carer so you can build ' +
        "and update this guide together.</p>" +
      '<label class="dash-collab-label">Edit link</label>' +
      '<div class="dash-collab-link"><input type="text" id="collabLinkInput" readonly value="' + esc(link) + '" /></div>' +
      '<div class="dash-collab-actions"></div>' +
      '<p class="dash-collab-warn">🔒 Anyone with this link can edit this guide — only share it with people you trust.</p>';

    var actions = body.querySelector(".dash-collab-actions");
    var copyBtn = document.createElement("button");
    copyBtn.type = "button"; copyBtn.className = "btn btn-primary btn-sm";
    copyBtn.textContent = "Copy edit link";
    copyBtn.addEventListener("click", function () { copyText(link, "Edit link copied!"); });
    actions.appendChild(copyBtn);
    if (navigator.share) {
      var shareBtn = document.createElement("button");
      shareBtn.type = "button"; shareBtn.className = "btn btn-ghost btn-sm";
      shareBtn.textContent = "Share…";
      shareBtn.addEventListener("click", function () {
        navigator.share({
          title: gname ? "Edit “" + gname + "” with me" : "Edit my guide with me",
          text: "Here's the edit link to our guide on GotIt Guides:",
          url: link
        }).catch(function () {});
      });
      actions.appendChild(shareBtn);
    }

    modal.appendChild(head);
    modal.appendChild(body);
    overlay.appendChild(modal);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeCollaborateModal(); });
    document.body.appendChild(overlay);
    // Preselect the link so it's easy to copy manually too.
    var inp = body.querySelector("#collabLinkInput");
    if (inp) { inp.focus(); inp.setSelectionRange(0, inp.value.length); }
  }
  function closeCollaborateModal() {
    var o = $("dashCollabOverlay");
    if (o && o.parentNode) o.parentNode.removeChild(o);
  }

  function closeMenus() {
    var open = document.querySelectorAll(".dash-menu.open");
    Array.prototype.forEach.call(open, function (m) { m.classList.remove("open"); });
  }

  /* ---------- card actions ---------- */
  function shareGuide(g) {
    var url = viewUrl(g.slug);
    if (navigator.share) navigator.share({ title: g.title || "My guide", url: url }).catch(function () {});
    else copyText(url, "Share link copied!");
  }

  function downloadQR(g) {
    if (!window.QRCode) { toast("QR isn't available right now."); return; }
    var url = viewUrl(g.slug);
    var tmp = document.createElement("div");
    tmp.style.position = "fixed"; tmp.style.left = "-9999px"; tmp.style.top = "0";
    document.body.appendChild(tmp);
    try { new QRCode(tmp, { text: url, width: 480, height: 480, correctLevel: QRCode.CorrectLevel.M }); } catch (e) {}
    setTimeout(function () {
      var canvas = tmp.querySelector("canvas");
      var data = canvas ? canvas.toDataURL("image/png") : (tmp.querySelector("img") || {}).src;
      if (data) {
        var a = document.createElement("a");
        a.href = data; a.download = (g.slug || "guide") + "-qr.png";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        toast("QR downloaded");
      }
      if (tmp.parentNode) tmp.parentNode.removeChild(tmp);
    }, 150);
  }

  function renameGuide(g, cardEl) {
    var name = window.prompt(
      "Name this guide on your dashboard.\n(The guide's own cover title won't change.)",
      g.title || "");
    if (name == null) return;
    name = name.trim();
    if (!name || name === g.title) return;
    // Dashboard-only label: flagged custom so re-publishes stop syncing the
    // cover title over it.
    GotItStore.updateSavedGuide(idTok, g.id, { title: name, customTitle: true }).then(function () {
      g.title = name;
      g.customTitle = true;
      var t = cardEl.querySelector(".dash-card-title");
      if (t) t.textContent = name;
      cardEl.setAttribute("data-title", name);
      toast("Dashboard name updated");
    }).catch(function () { toast("Couldn't rename that just now."); });
  }

  function duplicateGuide(g) {
    toast("Duplicating…");
    var dupTitle = (g.title || "Guide") + " (copy)";
    GotItStore.get(g.slug).then(function (obj) {
      if (!obj) throw new Error("not found");
      var locked = GotItStore.isEncrypted(obj);
      var newSlug = (g.slug || "guide").slice(0, 40) + "-" + randSuffix();
      var newToken = randToken();
      var payload;
      if (locked) {
        payload = {}; for (var k in obj) if (obj.hasOwnProperty(k)) payload[k] = obj[k];
        payload.slug = newSlug; // envelope metadata; decrypts with the same code
      } else {
        payload = JSON.parse(JSON.stringify(obj));
        payload.slug = newSlug; payload.title = dupTitle; payload.createdAt = Date.now();
      }
      return GotItStore.create(payload, newToken).then(function () {
        return GotItStore.saveGuide(idTok, {
          slug: newSlug, editToken: newToken, title: dupTitle,
          emoji: g.emoji, status: "published", locked: locked
        });
      });
    }).then(function () {
      return reload();
    }).then(function () { toast("Duplicated ✓"); })
      .catch(function () { toast("Couldn't duplicate that one."); });
  }

  // Give a published guide a new link name. The link is the guide's record id,
  // so this republishes the same content at the new address and points the
  // dashboard row there. The old record isn't deleted (the store has no delete
  // for account-less guides), so a previously shared link keeps showing the
  // guide as it was — hence the "best before you share it" warning.
  function changeLink(g) {
    var input = window.prompt(
      "New link name (letters, numbers and hyphens):\n" + location.host + "/g/…",
      g.slug);
    if (input == null) return;
    var slug = String(input).toLowerCase().trim()
      .replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
    if (!slug || slug === g.slug) return;
    if (!window.confirm(
      "Move this guide to " + location.host + "/g/" + slug + "?\n\n" +
      "If you've already shared the old link, it may keep showing the old version — " +
      "changing the link is best done before sharing.")) return;
    toast("Changing link…");
    GotItStore.get(slug).then(function (existing) {
      if (existing) { toast("That link name is already taken — try another."); return; }
      return GotItStore.get(g.slug).then(function (obj) {
        if (!obj) throw new Error("not found");
        var payload;
        if (GotItStore.isEncrypted(obj)) {
          // Locked guide: copy the envelope as-is (still opens with the same
          // code); the slug lives in the envelope metadata.
          payload = {};
          for (var k in obj) if (obj.hasOwnProperty(k)) payload[k] = obj[k];
          payload.slug = slug;
        } else {
          payload = obj;
          payload.slug = slug;
        }
        return GotItStore.create(payload, g.editToken).then(function () {
          return GotItStore.updateSavedGuide(idTok, g.id, { slug: slug });
        }).then(function () {
          g.slug = slug;
          render();
          copyText(viewUrl(slug), "Link changed — new link copied!");
        });
      });
    }).catch(function () { toast("Couldn't change the link just now."); });
  }

  function deleteGuide(g, cardEl) {
    if (!window.confirm("Remove “" + (g.title || "this guide") +
      "” from your dashboard?\n\nThis doesn't delete the guide itself — its links keep working.")) return;
    GotItStore.deleteSavedGuide(idTok, g.id).then(function () {
      guides = guides.filter(function (x) { return x.id !== g.id; });
      render();
      toast("Removed from dashboard");
    }).catch(function () { toast("Couldn't remove that just now."); });
  }

  /* ---------- search ---------- */
  function applyFilter(q) {
    q = (q || "").trim().toLowerCase();
    var any = false;
    Array.prototype.forEach.call($("dashGrid").children, function (cardEl) {
      var title = (cardEl.getAttribute("data-title") || "").toLowerCase();
      var show = !q || title.indexOf(q) >= 0;
      cardEl.style.display = show ? "" : "none";
      if (show) any = true;
    });
    $("dashNoResults").hidden = any || !q;
  }

  /* ---------- render ---------- */
  function render() {
    applyGreeting();
    var grid = $("dashGrid");
    grid.innerHTML = "";
    guides.forEach(function (g) { grid.appendChild(card(g)); });

    $("dashEmpty").hidden = guides.length > 0;
    $("dashSearchWrap").hidden = guides.length < 3;
    if (guides.length < 3 && $("dashSearch")) $("dashSearch").value = "";
    $("dashNoResults").hidden = true;
    $("dashTeaser").hidden = false;

    showOnly("dashGuides");
    $("settingsBtn").hidden = false;
    $("dashCreateTop").hidden = false;
  }

  function reload() {
    return GotItStore.listSavedGuides(idTok).then(function (items) { guides = items; render(); });
  }

  /* ---------- settings ---------- */
  function openSettings() {
    $("setName").value = (profile && profile.displayName) ||
      (user && user.name && user.name !== user.email ? user.name : "") || "";
    $("setEmail").textContent = (user && user.email) || "—";
    $("setNameNote").hidden = true;
    $("settingsModal").hidden = false;
  }
  function closeSettings() { $("settingsModal").hidden = true; }

  function saveDisplayName(value, noteEl) {
    value = (value || "").trim();
    if (!value) return;
    GotItStore.saveProfile(idTok, value).then(function (p) {
      profile = p;
      applyGreeting();
      if (noteEl) { noteEl.textContent = "Saved ✓"; noteEl.hidden = false; }
    }).catch(function () {
      if (noteEl) { noteEl.textContent = "Couldn't save — try again."; noteEl.hidden = false; }
    });
  }

  function deleteAccount() {
    if (!window.confirm(
      "Delete your account?\n\nThis removes your dashboard and saved-guide list. " +
      "Your published guides and their links keep working. This can't be undone."
    )) return;
    var btn = $("setDelete");
    btn.disabled = true; btn.textContent = "Deleting…";
    var jobs = guides.map(function (g) { return GotItStore.deleteSavedGuide(idTok, g.id).catch(function () {}); });
    if (profile && profile.id) jobs.push(GotItStore.deleteProfile(idTok, profile.id).catch(function () {}));
    Promise.all(jobs).then(function () { return GotItAuth.deleteAccount(); }).then(function () {
      window.location.href = "index.html";
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = "Delete account";
      toast(e.message || "Couldn't delete the account just now.");
    });
  }

  /* ---------- load ---------- */
  function load() {
    GotItAuth.idToken().then(function (tok) {
      if (!tok) { showSignin(); return; }
      idTok = tok;
      user = GotItAuth.getUser();
      Promise.all([
        GotItStore.getProfile(tok).catch(function () { return null; }),
        GotItStore.listSavedGuides(tok),
        GotItStore.listGuideFeedback().catch(function () { return []; }),
        // Guarded: a cached older store.js won't have guideStats yet.
        (GotItStore.guideStats ? GotItStore.guideStats() : Promise.resolve({}))
          .catch(function () { return {}; })
      ]).then(function (res) {
        profile = res[0];
        suggestions = res[2] || [];
        gstats = res[3] || {};
        // No profile yet → brand-new account. Send the one-time welcome email
        // and create a profile so it's used as the "already welcomed" guard and
        // won't fire again. The backend emails the user's own verified address.
        if (!profile && user && user.email) {
          isNewUser = true;
          var nm = (user.name && user.name !== user.email) ? user.name : "";
          GotItStore.sendWelcome(idTok, nm).catch(function () {});
          GotItStore.saveProfile(idTok, nm).then(function (p) { if (p) profile = p; }).catch(function () {});
        }
        var items = res[1];
        var pending = getPending();
        if (pending && pending.slug && !items.some(function (g) { return g.slug === pending.slug; })) {
          clearPending();
          return GotItStore.saveGuide(tok, pending).then(function () {
            // They chose "Save to my guides" on the share screen (then signed
            // in). Email their links too, by default, as a backup (best-effort).
            if (user && user.email && GotItStore.sendLinks) {
              GotItStore.sendLinks({
                email: user.email, slug: pending.slug, editToken: pending.editToken,
                origin: location.origin, title: pending.title, emoji: pending.emoji, password: ""
              }).catch(function () {});
            }
            return GotItStore.listSavedGuides(tok);
          });
        }
        clearPending();
        return items;
      }).then(function (items) {
        guides = items;
        render();
      }).catch(function () {
        showSignin("Your session expired — please sign in again.");
      });
    });
  }

  /* ---------- wire up ---------- */
  $("signinGoogle").addEventListener("click", function () {
    this.disabled = true;
    GotItAuth.signInWithGoogle().catch(function (e) {
      $("signinGoogle").disabled = false;
      $("dashSigninNote").textContent = e.message || "Couldn't start sign-in.";
      $("dashSigninNote").hidden = false;
    });
  });

  $("namePrompt").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = $("nameInput").value.trim();
    if (!v) return;
    saveDisplayName(v);
    toast("Nice to meet you, " + firstName(v) + "!");
  });

  $("dashSearch").addEventListener("input", function () { applyFilter(this.value); });

  $("settingsBtn").addEventListener("click", openSettings);
  $("settingsClose").addEventListener("click", closeSettings);
  Array.prototype.forEach.call(document.querySelectorAll("[data-set-close]"), function (el) {
    el.addEventListener("click", closeSettings);
  });
  $("setNameSave").addEventListener("click", function () { saveDisplayName($("setName").value, $("setNameNote")); });
  $("setSignout").addEventListener("click", function () { GotItAuth.signOut(); });
  $("setDelete").addEventListener("click", deleteAccount);

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".dash-card-more-wrap")) closeMenus();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeMenus(); closeSettings(); closeFeedbackModal(); closeCollaborateModal(); closeStatsModal(); }
  });

  /* ---------- boot ---------- */
  GotItAuth.handleRedirect().then(function (res) {
    if (res && res.error) {
      clearPending();
      showSignin("Sign-in didn't complete: " + res.error);
      return;
    }
    load();
  });
})();
