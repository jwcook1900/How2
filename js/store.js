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
