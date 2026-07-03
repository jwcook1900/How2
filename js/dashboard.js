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
  var isNewUser = false; // true on the first sign-in (no profile yet)

  /* ---------- helpers ---------- */
  function viewUrl(slug) { return location.origin + "/g/" + encodeURIComponent(slug); }
  function editUrl(slug, token) {
    return "builder.html?g=" + encodeURIComponent(slug) + "&t=" + encodeURIComponent(token);
  }
  function firstName(name) { return String(name || "").trim().split(/\s+/)[0]; }
  function randSuffix() { return Math.random().toString(36).slice(2, 6); }
  function randToken() {
    var a = new Uint8Array(16); window.crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
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

    el.appendChild(moreWrap);
    el.appendChild(main);
    el.appendChild(meta);
    el.appendChild(updated);
    el.appendChild(actions);
    return el;
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
    var name = window.prompt("Rename this guide", g.title || "");
    if (name == null) return;
    name = name.trim();
    if (!name || name === g.title) return;
    GotItStore.updateSavedGuide(idTok, g.id, { title: name }).then(function () {
      g.title = name;
      var t = cardEl.querySelector(".dash-card-title");
      if (t) t.textContent = name;
      cardEl.setAttribute("data-title", name);
      // Keep the published guide's own title in step (unlocked guides only).
      if (!g.locked) {
        GotItStore.get(g.slug).then(function (obj) {
          if (obj && !GotItStore.isEncrypted(obj)) { obj.title = name; GotItStore.update(obj); }
        }).catch(function () {});
      }
      toast("Renamed");
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
        GotItStore.listSavedGuides(tok)
      ]).then(function (res) {
        profile = res[0];
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
    if (e.key === "Escape") { closeMenus(); closeSettings(); }
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
