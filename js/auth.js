/* ============================================================
   GotIt Guides — auth layer (optional accounts)
   Cognito hosted-UI sign-in (Authorization Code + PKCE) for the
   "My Guides" dashboard. Reads its config from amplify_outputs.json
   (the same file the data layer uses), so nothing is hard-coded.

   Accounts are entirely optional: guide creation never needs one.
   This is only used for save-to-dashboard / sign-in.
   ============================================================ */
window.GotItAuth = (function () {
  "use strict";

  var TOK_KEY = "gotit_auth";   // localStorage: tokens
  var PKCE_KEY = "gotit_pkce";  // sessionStorage: PKCE code_verifier
  var cfgPromise = null;

  // Custom Cognito hosted-UI domain: the app runs all OAuth (authorize / token /
  // logout) through this so the Google sign-in screen shows our domain instead of
  // the generated "…amazoncognito.com" one. Set to "" to fall back to the
  // Amplify-provisioned domain from amplify_outputs.json (instant rollback).
  var CUSTOM_AUTH_DOMAIN = "auth.gotitguides.com";

  /* ---- config from amplify_outputs.json ---- */
  function loadCfg() {
    if (cfgPromise) return cfgPromise;
    cfgPromise = fetch("amplify_outputs.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.auth || !j.auth.oauth || !j.auth.oauth.domain) return null;
        var a = j.auth, o = a.oauth;
        var domain = CUSTOM_AUTH_DOMAIN || o.domain;
        if (domain.indexOf("http") !== 0) domain = "https://" + domain;
        return {
          region: a.aws_region,
          userPoolId: a.user_pool_id,
          clientId: a.user_pool_client_id,
          domain: domain.replace(/\/$/, ""),
          scopes: (o.scopes && o.scopes.length) ? o.scopes : ["openid", "email", "profile"]
        };
      })
      .catch(function () { return null; });
    return cfgPromise;
  }

  function redirectUri() { return window.location.origin + "/dashboard.html"; }

  /* ---- PKCE helpers ---- */
  function b64url(buf) {
    var bytes = new Uint8Array(buf), s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function randomVerifier() {
    var a = new Uint8Array(32);
    window.crypto.getRandomValues(a);
    return b64url(a.buffer);
  }
  function challengeFor(verifier) {
    return window.crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(verifier))
      .then(b64url);
  }

  function toForm(obj) {
    return Object.keys(obj).map(function (k) {
      return encodeURIComponent(k) + "=" + encodeURIComponent(obj[k]);
    }).join("&");
  }

  /* ---- start sign-in (redirect to the Cognito hosted page) ----
     opts.idp = "Google" jumps straight to Google; omit it to show the
     hosted page (Google + email). */
  function startLogin(opts) {
    opts = opts || {};
    return loadCfg().then(function (cfg) {
      if (!cfg) throw new Error("Sign-in is not configured yet.");
      var verifier = randomVerifier();
      sessionStorage.setItem(PKCE_KEY, verifier);
      return challengeFor(verifier).then(function (challenge) {
        var p = {
          response_type: "code",
          client_id: cfg.clientId,
          redirect_uri: redirectUri(),
          scope: cfg.scopes.join(" "),
          code_challenge: challenge,
          code_challenge_method: "S256"
        };
        if (opts.idp) p.identity_provider = opts.idp;
        window.location.href = cfg.domain + "/oauth2/authorize?" + toForm(p);
      });
    });
  }

  /* ---- exchange the ?code for tokens ---- */
  function exchangeCode(code) {
    return loadCfg().then(function (cfg) {
      var verifier = sessionStorage.getItem(PKCE_KEY) || "";
      return fetch(cfg.domain + "/oauth2/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: toForm({
          grant_type: "authorization_code",
          client_id: cfg.clientId,
          code: code,
          redirect_uri: redirectUri(),
          code_verifier: verifier
        })
      }).then(function (r) { return r.json(); }).then(function (t) {
        if (t.error) throw new Error(t.error_description || t.error);
        saveTokens(t);
        sessionStorage.removeItem(PKCE_KEY);
        return t;
      });
    });
  }

  /* ---- token storage ---- */
  function saveTokens(t) {
    var now = Math.floor(Date.now() / 1000);
    var prev = getTokens();
    localStorage.setItem(TOK_KEY, JSON.stringify({
      id_token: t.id_token,
      access_token: t.access_token,
      refresh_token: t.refresh_token || prev.refresh_token || null,
      expires_at: now + (t.expires_in || 3600)
    }));
  }
  function getTokens() {
    try { return JSON.parse(localStorage.getItem(TOK_KEY) || "{}"); } catch (e) { return {}; }
  }
  function clearTokens() { localStorage.removeItem(TOK_KEY); }

  function decodeJwt(jwt) {
    try {
      var part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      var json = decodeURIComponent(atob(part).split("").map(function (c) {
        return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(""));
      return JSON.parse(json);
    } catch (e) { return null; }
  }

  function isSignedIn() {
    var t = getTokens();
    return !!(t.id_token && t.expires_at && t.expires_at > Math.floor(Date.now() / 1000) + 30);
  }

  function getUser() {
    var t = getTokens();
    if (!t.id_token) return null;
    var c = decodeJwt(t.id_token);
    if (!c) return null;
    return { sub: c.sub, email: c.email, name: c.name || c.given_name || c.email };
  }

  /* ---- a valid token set, refreshing if needed ---- */
  function freshTokens() {
    var t = getTokens();
    if (!t.id_token) return Promise.resolve(null);
    var now = Math.floor(Date.now() / 1000);
    if (t.expires_at && t.expires_at > now + 30) return Promise.resolve(t);
    if (!t.refresh_token) { clearTokens(); return Promise.resolve(null); }
    return loadCfg().then(function (cfg) {
      return fetch(cfg.domain + "/oauth2/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: toForm({ grant_type: "refresh_token", client_id: cfg.clientId, refresh_token: t.refresh_token })
      }).then(function (r) { return r.json(); }).then(function (nt) {
        if (nt.error) { clearTokens(); return null; }
        saveTokens(nt);
        return getTokens();
      });
    });
  }
  // AppSync wants the id token; Cognito self-service APIs want the access token.
  function idToken() { return freshTokens().then(function (t) { return t ? t.id_token : null; }); }
  function accessToken() { return freshTokens().then(function (t) { return t ? t.access_token : null; }); }

  /* ---- self-service account deletion (Cognito DeleteUser via access token) ----
     Needs the aws.cognito.signin.user.admin scope (present in our token). Removes
     the auth account only — published guides are account-less and keep working. */
  function deleteAccount() {
    return Promise.all([loadCfg(), accessToken()]).then(function (a) {
      var cfg = a[0], at = a[1];
      if (!cfg || !at) throw new Error("You're not signed in.");
      return fetch("https://cognito-idp." + cfg.region + ".amazonaws.com/", {
        method: "POST",
        headers: {
          "content-type": "application/x-amz-json-1.1",
          "x-amz-target": "AWSCognitoIdentityProviderService.DeleteUser"
        },
        body: JSON.stringify({ AccessToken: at })
      }).then(function (r) {
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.message || "Couldn't delete the account."); });
      }).then(function () { clearTokens(); });
    });
  }

  /* ---- handle the redirect back from Cognito (call on page load) ---- */
  function handleRedirect() {
    var s = window.location.search;
    var errM = s.match(/[?&]error=([^&]+)/);
    if (errM) {
      var d = s.match(/[?&]error_description=([^&]+)/);
      history.replaceState({}, document.title, window.location.pathname);
      return Promise.resolve({ error: decodeURIComponent((d && d[1]) || errM[1]).replace(/\+/g, " ") });
    }
    var codeM = s.match(/[?&]code=([^&]+)/);
    if (!codeM) return Promise.resolve(null);
    return exchangeCode(decodeURIComponent(codeM[1])).then(function () {
      history.replaceState({}, document.title, window.location.pathname);
      return { signedIn: true };
    }).catch(function (e) {
      history.replaceState({}, document.title, window.location.pathname);
      return { error: e.message || "Sign-in failed." };
    });
  }

  function signOut() {
    clearTokens();
    loadCfg().then(function (cfg) {
      if (!cfg) { window.location.href = "index.html"; return; }
      window.location.href = cfg.domain + "/logout?" + toForm({
        client_id: cfg.clientId,
        logout_uri: window.location.origin + "/"
      });
    });
  }

  return {
    config: loadCfg,
    signInWithGoogle: function () { return startLogin({ idp: "Google" }); },
    signIn: function () { return startLogin({}); },
    handleRedirect: handleRedirect,
    isSignedIn: isSignedIn,
    getUser: getUser,
    idToken: idToken,
    accessToken: accessToken,
    deleteAccount: deleteAccount,
    signOut: signOut
  };
})();
