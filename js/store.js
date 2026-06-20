/* ============================================================
   How2 — storage layer
   Saves/loads guides from the cloud (AWS Amplify Data) when configured,
   and transparently falls back to localStorage otherwise so the app
   always works (offline, file://, or before the backend is deployed).
   ============================================================ */
window.How2Store = (function () {
  "use strict";

  var GUIDES_KEY = "how2_guides";
  var TOKENS_KEY = "how2_tokens";
  var cfgPromise = null;

  /* ---- config: read amplify_outputs.json (generated at deploy) ---- */
  function loadConfig() {
    if (cfgPromise) return cfgPromise;
    cfgPromise = fetch("amplify_outputs.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.data && j.data.url && j.data.api_key) {
          return { url: j.data.url, key: j.data.api_key };
        }
        return null;
      })
      .catch(function () { return null; });
    return cfgPromise;
  }

  function gql(cfg, query, variables) {
    return fetch(cfg.url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": cfg.key },
      body: JSON.stringify({ query: query, variables: variables })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res.errors && res.errors.length) {
        throw new Error(res.errors[0].message || "Request failed");
      }
      return res.data;
    });
  }

  /* ---- optional password protection (AES-GCM, key from PBKDF2) ----
     A locked guide is stored as an envelope { enc:1, slug, salt, iv, ct }.
     The real guide JSON is encrypted in `ct`; nothing readable is stored,
     so the content is private even from the database. Needs a secure
     context (https / localhost) for window.crypto.subtle. */
  function subtle() {
    return (window.crypto && window.crypto.subtle) ? window.crypto.subtle : null;
  }
  function b64(buf) {
    var bytes = new Uint8Array(buf), s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function unb64(str) {
    var bin = atob(str), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }
  function deriveKey(password, salt) {
    var enc = new TextEncoder();
    return subtle().importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"])
      .then(function (base) {
        return subtle().deriveKey(
          { name: "PBKDF2", salt: salt, iterations: 150000, hash: "SHA-256" },
          base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      });
  }

  /* ---- localStorage fallback ---- */
  function localGuides() {
    try { return JSON.parse(localStorage.getItem(GUIDES_KEY) || "{}"); } catch (e) { return {}; }
  }
  function localTokens() {
    try { return JSON.parse(localStorage.getItem(TOKENS_KEY) || "{}"); } catch (e) { return {}; }
  }
  function localPut(guide, editToken) {
    var g = localGuides(); g[guide.slug] = guide;
    localStorage.setItem(GUIDES_KEY, JSON.stringify(g));
    if (editToken) {
      var t = localTokens(); t[guide.slug] = editToken;
      localStorage.setItem(TOKENS_KEY, JSON.stringify(t));
    }
  }

  /* ---- public API (all async, return Promises) ---- */
  return {
    // Is the cloud backend available?
    isCloud: function () { return loadConfig().then(function (c) { return !!c; }); },

    // Can we password-protect (needs a secure context)?
    canEncrypt: function () { return !!subtle(); },

    // True if a stored object is a locked/encrypted envelope.
    isEncrypted: function (obj) { return !!(obj && obj.enc === 1 && obj.ct); },

    // Encrypt a guide object with a password → storable envelope.
    encrypt: function (guide, password) {
      if (!subtle()) return Promise.reject(new Error("Password protection needs https"));
      var salt = window.crypto.getRandomValues(new Uint8Array(16));
      var iv = window.crypto.getRandomValues(new Uint8Array(12));
      return deriveKey(password, salt).then(function (key) {
        var data = new TextEncoder().encode(JSON.stringify(guide));
        return subtle().encrypt({ name: "AES-GCM", iv: iv }, key, data);
      }).then(function (ct) {
        return { enc: 1, slug: guide.slug, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
      });
    },

    // Decrypt an envelope with a password → guide object (rejects if wrong).
    decrypt: function (env, password) {
      if (!subtle()) return Promise.reject(new Error("Password protection needs https"));
      return deriveKey(password, unb64(env.salt)).then(function (key) {
        return subtle().decrypt({ name: "AES-GCM", iv: unb64(env.iv) }, key, unb64(env.ct));
      }).then(function (pt) {
        return JSON.parse(new TextDecoder().decode(pt));
      });
    },

    // Create a new guide. Resolves with { cloud: bool }.
    create: function (guide, editToken) {
      return loadConfig().then(function (cfg) {
        if (!cfg) { localPut(guide, editToken); return { cloud: false }; }
        var q = "mutation Create($input: CreateGuideInput!){ createGuide(input: $input){ id } }";
        return gql(cfg, q, { input: { id: guide.slug, editToken: editToken, payload: JSON.stringify(guide) } })
          .then(function () { return { cloud: true }; });
      });
    },

    // Update an existing guide's contents.
    update: function (guide) {
      return loadConfig().then(function (cfg) {
        if (!cfg) { localPut(guide); return { cloud: false }; }
        var q = "mutation Upd($input: UpdateGuideInput!){ updateGuide(input: $input){ id } }";
        return gql(cfg, q, { input: { id: guide.slug, payload: JSON.stringify(guide) } })
          .then(function () { return { cloud: true }; });
      });
    },

    // Read a guide for public viewing (no edit token fetched).
    get: function (slug) {
      return loadConfig().then(function (cfg) {
        if (!cfg) { return localGuides()[slug] || null; }
        var q = "query Get($id: ID!){ getGuide(id: $id){ id payload } }";
        return gql(cfg, q, { id: slug }).then(function (d) {
          if (!d.getGuide) return null;
          return JSON.parse(d.getGuide.payload);
        });
      });
    },

    // Server-side AI (keyless). `opts` may include text, category, question,
    // fileData (base64) and fileType. Resolves with the handler's JSON result,
    // or null when no cloud backend is configured (so callers can fall back).
    ai: function (mode, opts) {
      opts = opts || {};
      return loadConfig().then(function (cfg) {
        if (!cfg) return null;
        var q = "query Ai($mode: String!, $text: String, $category: String, " +
          "$question: String, $fileData: String, $fileType: String){ " +
          "aiAssist(mode: $mode, text: $text, category: $category, " +
          "question: $question, fileData: $fileData, fileType: $fileType) }";
        return gql(cfg, q, {
          mode: mode,
          text: opts.text || null,
          category: opts.category || null,
          question: opts.question || null,
          fileData: opts.fileData || null,
          fileType: opts.fileType || null
        }).then(function (d) {
          var r = d.aiAssist;
          if (typeof r === "string") { try { return JSON.parse(r); } catch (e) { return r; } }
          return r;
        });
      });
    },

    // Read a guide plus its edit token (for the edit-link flow).
    getForEdit: function (slug) {
      return loadConfig().then(function (cfg) {
        if (!cfg) {
          var g = localGuides()[slug];
          if (!g) return null;
          return { guide: g, editToken: localTokens()[slug] || null };
        }
        var q = "query Get($id: ID!){ getGuide(id: $id){ id editToken payload } }";
        return gql(cfg, q, { id: slug }).then(function (d) {
          if (!d.getGuide) return null;
          return { guide: JSON.parse(d.getGuide.payload), editToken: d.getGuide.editToken };
        });
      });
    }
  };
})();
