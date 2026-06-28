/* ============================================================
   GotIt Guides — "My Guides" dashboard
   Handles the Cognito redirect, lists the signed-in user's saved
   guides, and completes a pending "save to my guides" if one was
   stashed before sign-in.
   ============================================================ */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var PENDING_KEY = "gotit_pending_save";

  function viewUrl(slug) { return "g/" + encodeURIComponent(slug); }
  function editUrl(slug, token) {
    return "builder.html?g=" + encodeURIComponent(slug) + "&t=" + encodeURIComponent(token);
  }

  function showOnly(id) {
    ["dashLoading", "dashSignin", "dashGuides"].forEach(function (k) {
      var el = $(k); if (el) el.hidden = (k !== id);
    });
  }

  function showSignin(note) {
    showOnly("dashSignin");
    $("signoutBtn").hidden = true;
    $("dashCreateTop").hidden = true;
    if (note) { $("dashSigninNote").textContent = note; $("dashSigninNote").hidden = false; }
  }

  function getPending() {
    try { return JSON.parse(localStorage.getItem(PENDING_KEY) || "null"); }
    catch (e) { return null; }
  }
  function clearPending() { localStorage.removeItem(PENDING_KEY); }

  /* ---- render ---- */
  function card(g, idToken) {
    var el = document.createElement("div");
    el.className = "dash-card";

    var top = document.createElement("a");
    top.className = "dash-card-main";
    top.href = viewUrl(g.slug);
    top.target = "_blank";
    top.rel = "noopener";

    var emoji = document.createElement("span");
    emoji.className = "dash-card-emoji";
    emoji.textContent = g.emoji || "📘";
    var title = document.createElement("div");
    title.className = "dash-card-title";
    title.textContent = g.title || "Untitled guide";
    top.appendChild(emoji);
    top.appendChild(title);

    var actions = document.createElement("div");
    actions.className = "dash-card-actions";

    var edit = document.createElement("a");
    edit.className = "btn btn-ghost btn-sm";
    edit.href = editUrl(g.slug, g.editToken);
    edit.textContent = "Edit";

    var view = document.createElement("a");
    view.className = "btn btn-ghost btn-sm";
    view.href = viewUrl(g.slug);
    view.target = "_blank";
    view.rel = "noopener";
    view.textContent = "View ↗";

    var remove = document.createElement("button");
    remove.className = "dash-card-remove";
    remove.type = "button";
    remove.title = "Remove from dashboard";
    remove.setAttribute("aria-label", "Remove from dashboard");
    remove.textContent = "×";
    remove.addEventListener("click", function () {
      if (!window.confirm("Remove “" + (g.title || "this guide") + "” from your dashboard? This doesn't delete the guide itself — your links still work.")) return;
      remove.disabled = true;
      GotItStore.deleteSavedGuide(idToken, g.id).then(function () {
        el.parentNode && el.parentNode.removeChild(el);
        if (!$("dashGrid").children.length) $("dashEmpty").hidden = false;
      }).catch(function () {
        remove.disabled = false;
        window.alert("Couldn't remove that just now — please try again.");
      });
    });

    actions.appendChild(edit);
    actions.appendChild(view);
    el.appendChild(remove);
    el.appendChild(top);
    el.appendChild(actions);
    return el;
  }

  function renderGuides(items, idToken) {
    var grid = $("dashGrid");
    grid.innerHTML = "";
    $("dashEmpty").hidden = items.length > 0;
    items.forEach(function (g) { grid.appendChild(card(g, idToken)); });

    var user = GotItAuth.getUser();
    if (user && user.name) {
      $("dashGreeting").textContent = "Hi " + String(user.name).split(" ")[0] + " 👋";
    }
    showOnly("dashGuides");
    $("signoutBtn").hidden = false;
    $("dashCreateTop").hidden = false;
  }

  /* ---- main load ---- */
  function load() {
    GotItAuth.idToken().then(function (idToken) {
      if (!idToken) { showSignin(); return; }

      GotItStore.listSavedGuides(idToken).then(function (items) {
        var pending = getPending();
        if (pending && pending.slug) {
          var already = items.some(function (g) { return g.slug === pending.slug; });
          clearPending();
          if (!already) {
            return GotItStore.saveGuide(idToken, pending).then(function () {
              return GotItStore.listSavedGuides(idToken);
            });
          }
        }
        return items;
      }).then(function (items) {
        renderGuides(items, idToken);
      }).catch(function (e) {
        // Token rejected / expired → ask to sign in again.
        showSignin("Your session expired — please sign in again.");
      });
    });
  }

  /* ---- wire up ---- */
  $("signinGoogle").addEventListener("click", function () {
    this.disabled = true;
    GotItAuth.signInWithGoogle().catch(function (e) {
      $("signinGoogle").disabled = false;
      $("dashSigninNote").textContent = e.message || "Couldn't start sign-in.";
      $("dashSigninNote").hidden = false;
    });
  });
  $("signoutBtn").addEventListener("click", function () { GotItAuth.signOut(); });

  /* ---- boot: handle the redirect from Cognito, then load ---- */
  GotItAuth.handleRedirect().then(function (res) {
    if (res && res.error) {
      clearPending();
      showSignin("Sign-in didn't complete: " + res.error);
      return;
    }
    load();
  });
})();
