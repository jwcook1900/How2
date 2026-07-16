/* ============================================================
   GotIt Guides — storage layer
   Saves/loads guides from the cloud (AWS Amplify Data) when configured,
   and transparently falls back to localStorage otherwise so the app
   always works (offline, file://, or before the backend is deployed).
   ============================================================ */
window.GotItStore = (function () {
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
          return {
            url: j.data.url,
            key: j.data.api_key,
            statsUrl: j.custom && j.custom.statsFunctionUrl,
            guideFeedbackUrl: j.custom && j.custom.guideFeedbackFunctionUrl,
            transcribeUrl: j.custom && j.custom.transcribeFunctionUrl
          };
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

  // Same as gql but authenticated as a signed-in user (Cognito id token in the
  // Authorization header → AppSync userPool auth). Used for owner-scoped data
  // like the "My Guides" dashboard (SavedGuide).
  function gqlAuth(cfg, query, variables, idToken) {
    return fetch(cfg.url, {
      method: "POST",
      headers: { "content-type": "application/json", "Authorization": idToken },
      body: JSON.stringify({ query: query, variables: variables })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res.errors && res.errors.length) {
        throw new Error(res.errors[0].message || "Request failed");
      }
      return res.data;
    });
  }

  // Decode a Cognito id token (JWT) payload, best-effort.
  function decodeJwt(t) {
    try {
      return JSON.parse(decodeURIComponent(escape(atob(
        String(t).split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
      ))));
    } catch (e) { return null; }
  }
  function emailFromIdToken(t) { var p = decodeJwt(t); return (p && p.email) || null; }
  function subFromIdToken(t) { var p = decodeJwt(t); return (p && p.sub) || null; }

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
    if (editToken) rememberToken(guide.slug, editToken);
  }
  function rememberToken(slug, token) {
    if (!slug || !token) return;
    try {
      var t = localTokens(); t[slug] = token;
      localStorage.setItem(TOKENS_KEY, JSON.stringify(t));
    } catch (e) { /* storage blocked — the feature just won't appear */ }
  }

  /* ---- HTML sanitiser for rich-text section bodies ----
     Parses inertly (DOMParser, so no images load and no scripts run), then
     rebuilds with only whitelisted tags and no attributes. */
  /* DETAILS/SUMMARY power the "dropdown inside a section" blocks for long
     lists. Attributes are stripped like everything else, which also drops
     `open` — so published dropdowns always start collapsed. */
  var ALLOWED_TAGS = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, UL: 1, OL: 1, LI: 1, BR: 1, P: 1, DIV: 1, DETAILS: 1, SUMMARY: 1 };
  function sanitizeHtml(html) {
    var docp;
    try { docp = new DOMParser().parseFromString(String(html), "text/html"); }
    catch (e) { return ""; }
    function clean(node) {
      var frag = document.createDocumentFragment();
      Array.prototype.forEach.call(node.childNodes, function (ch) {
        if (ch.nodeType === 3) {
          frag.appendChild(document.createTextNode(ch.nodeValue));
        } else if (ch.nodeType === 1) {
          var inner = clean(ch);
          if (ALLOWED_TAGS[ch.tagName]) {
            var keep = document.createElement(ch.tagName); // fresh = no attributes
            keep.appendChild(inner);
            frag.appendChild(keep);
          } else {
            frag.appendChild(inner); // unwrap disallowed tags, keep their text
          }
        }
      });
      return frag;
    }
    var out = document.createElement("div");
    out.appendChild(clean(docp.body));
    return out.innerHTML;
  }

  /* ---- public API (all async, return Promises) ---- */
  return {
    // Is the cloud backend available?
    isCloud: function () { return loadConfig().then(function (c) { return !!c; }); },

    /* ---- "My Guides" dashboard (owner-scoped SavedGuide, userPool auth) ----
       These need a signed-in user's Cognito id token (from GotItAuth.idToken()).
       The owner is set/enforced server-side, so a user only ever sees their own
       saved guides. Storing slug + editToken lets the dashboard link straight to
       viewing and editing. */
    listSavedGuides: function (idToken) {
      return loadConfig().then(function (cfg) {
        if (!cfg) return [];
        return gqlAuth(cfg,
          "query { listSavedGuides { items { id slug editToken title emoji status locked customTitle createdAt updatedAt } } }",
          {}, idToken
        ).then(function (d) {
          var items = (d.listSavedGuides && d.listSavedGuides.items) || [];
          items.sort(function (a, b) {
            return (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || "");
          });
          return items;
        });
      });
    },
    saveGuide: function (idToken, g) {
      return loadConfig().then(function (cfg) {
        if (!cfg) throw new Error("Backend not available");
        return gqlAuth(cfg,
          "mutation($input: CreateSavedGuideInput!) { createSavedGuide(input: $input) { id slug } }",
          { input: {
            slug: g.slug, editToken: g.editToken,
            title: g.title || "Untitled guide", emoji: g.emoji || "📘",
            status: g.status || "published", locked: !!g.locked,
            ownerEmail: emailFromIdToken(idToken), // so sitter feedback can reach them
            ownerSub: subFromIdToken(idToken)      // ...and show on their dashboard
          } },
          idToken
        ).then(function (d) { return d.createSavedGuide; });
      });
    },
    // Update fields on a saved guide (rename, or refresh title/emoji/locked +
    // bump updatedAt when the underlying guide is edited).
    updateSavedGuide: function (idToken, id, fields) {
      return loadConfig().then(function (cfg) {
        if (!cfg) throw new Error("Backend not available");
        var input = { id: id };
        ["title", "emoji", "status", "locked", "slug", "customTitle"].forEach(function (k) {
          if (fields[k] !== undefined) input[k] = fields[k];
        });
        var oe = emailFromIdToken(idToken); // keep the owner email fresh for feedback routing
        if (oe) input.ownerEmail = oe;
        var os = subFromIdToken(idToken);
        if (os) input.ownerSub = os;
        return gqlAuth(cfg,
          "mutation($input: UpdateSavedGuideInput!) { updateSavedGuide(input: $input) { id updatedAt } }",
          { input: input }, idToken
        ).then(function (d) { return d.updateSavedGuide; });
      });
    },
    deleteSavedGuide: function (idToken, id) {
      return loadConfig().then(function (cfg) {
        if (!cfg) throw new Error("Backend not available");
        return gqlAuth(cfg,
          "mutation($input: DeleteSavedGuideInput!) { deleteSavedGuide(input: $input) { id } }",
          { input: { id: id } }, idToken
        );
      });
    },

    /* ---- User profile (display name) ---- */
    getProfile: function (idToken) {
      return loadConfig().then(function (cfg) {
        if (!cfg) return null;
        return gqlAuth(cfg,
          "query { listUserProfiles { items { id displayName } } }", {}, idToken
        ).then(function (d) {
          var items = (d.listUserProfiles && d.listUserProfiles.items) || [];
          return items[0] || null;
        });
      });
    },
    saveProfile: function (idToken, displayName) {
      var self = this;
      return self.getProfile(idToken).then(function (existing) {
        return loadConfig().then(function (cfg) {
          if (existing && existing.id) {
            return gqlAuth(cfg,
              "mutation($input: UpdateUserProfileInput!) { updateUserProfile(input: $input) { id displayName } }",
              { input: { id: existing.id, displayName: displayName } }, idToken
            ).then(function (d) { return d.updateUserProfile; });
          }
          return gqlAuth(cfg,
            "mutation($input: CreateUserProfileInput!) { createUserProfile(input: $input) { id displayName } }",
            { input: { displayName: displayName } }, idToken
          ).then(function (d) { return d.createUserProfile; });
        });
      });
    },
    /* ---- Sitter suggestions on the dashboard ----
       Read/dismissed through the guide-feedback function, scoped by the caller's
       verified Cognito identity (access token), not AppSync owner-auth. */
    // The signed-in creator's own per-guide analytics (views/shares + a
    // 14-day daily series), served by the guide-feedback function after
    // verifying the caller's identity. Resolves {} when unavailable.
    guideStats: function () {
      return Promise.all([loadConfig(), window.GotItAuth && GotItAuth.idToken()]).then(function (r) {
        var cfg = r[0], idToken = r[1];
        if (!cfg || !cfg.guideFeedbackUrl || !idToken) return {};
        return fetch(cfg.guideFeedbackUrl, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "stats", idToken: idToken, tz: new Date().getTimezoneOffset() })
        }).then(function (res) { return res.ok ? res.json() : { guides: {} }; })
          .then(function (d) { return (d && d.guides) || {}; }, function () { return {}; });
      }, function () { return {}; });
    },

    listGuideFeedback: function () {
      return Promise.all([loadConfig(), window.GotItAuth && GotItAuth.idToken()]).then(function (r) {
        var cfg = r[0], idToken = r[1];
        if (!cfg || !cfg.guideFeedbackUrl || !idToken) return [];
        return fetch(cfg.guideFeedbackUrl, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "list", idToken: idToken })
        }).then(function (res) { return res.ok ? res.json() : { items: [] }; })
          .then(function (d) { return (d && d.items) || []; }, function () { return []; });
      }, function () { return []; });
    },
    dismissGuideFeedback: function (id) {
      return Promise.all([loadConfig(), window.GotItAuth && GotItAuth.idToken()]).then(function (r) {
        var cfg = r[0], idToken = r[1];
        if (!cfg || !cfg.guideFeedbackUrl || !idToken) return null;
        return fetch(cfg.guideFeedbackUrl, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "dismiss", idToken: idToken, id: id })
        }).then(function (res) { return res.ok ? res.json() : null; });
      });
    },

    deleteProfile: function (idToken, id) {
      return loadConfig().then(function (cfg) {
        if (!cfg) return null;
        return gqlAuth(cfg,
          "mutation($input: DeleteUserProfileInput!) { deleteUserProfile(input: $input) { id } }",
          { input: { id: id } }, idToken
        );
      });
    },

    // One-time welcome email for a new account. The backend emails the caller's
    // own verified identity; `name` is just for the greeting. Best-effort.
    sendWelcome: function (idToken, name) {
      return loadConfig().then(function (cfg) {
        if (!cfg) return { ok: false };
        return gqlAuth(cfg,
          "query Sw($name: String) { sendWelcome(name: $name) }",
          { name: name || null }, idToken
        ).then(function (d) { return (d && d.sendWelcome) || { ok: true }; },
          function () { return { ok: false }; });
      }, function () { return { ok: false }; });
    },

    /* ---- Per-block accent colours (shared by builder + published guide) ----
       Each block (section / log / emergency) can store a palette `color` key;
       the cover stores `coverColor`. Applied as a tasteful accent: a coloured
       edge + soft header tint, text stays dark. */
    palette: [
      { key: "coral",  accent: "#FF6B35", soft: "#FFE7DC" },
      { key: "red",    accent: "#E5484D", soft: "#FBE3E4" },
      { key: "amber",  accent: "#F59E0B", soft: "#FCEFD3" },
      { key: "green",  accent: "#22A06B", soft: "#DEF3E9" },
      { key: "teal",   accent: "#14B8A6", soft: "#D6F3EF" },
      { key: "blue",   accent: "#3B82F6", soft: "#E5EEFE" },
      { key: "purple", accent: "#8B5CF6", soft: "#ECE6FD" },
      { key: "pink",   accent: "#EC4899", soft: "#FBE3F1" }
    ],
    paletteColor: function (key) {
      for (var i = 0; i < this.palette.length; i++) if (this.palette[i].key === key) return this.palette[i];
      return null;
    },
    // Apply (or clear) a block's accent colour on its element.
    applyAccent: function (el, key) {
      if (!el) return;
      var c = key && key !== "default" ? this.paletteColor(key) : null;
      if (c) {
        el.classList.add("has-accent");
        el.style.setProperty("--accent", c.accent);
        el.style.setProperty("--soft", c.soft);
      } else {
        el.classList.remove("has-accent");
        el.style.removeProperty("--accent");
        el.style.removeProperty("--soft");
      }
    },
    // Recolour the cover gradient (kept separate so a cover photo can win).
    applyCoverAccent: function (coverEl, key) {
      if (!coverEl) return;
      var c = key && key !== "default" ? this.paletteColor(key) : null;
      coverEl.style.background = c
        ? "linear-gradient(135deg, rgba(0,0,0,0.04), rgba(0,0,0,0.26)), " + c.accent
        : "";
    },

    /* ---- Rich-text section bodies (shared by builder + published guide) ----
       Bodies may be plain text (legacy) or limited HTML (bullets/bold/italic
       added in the editor). renderBody returns safe HTML to drop into the DOM:
       plain text is escaped with line breaks; HTML is sanitised to a small tag
       whitelist with all attributes stripped (no XSS from a shared link). */
    renderBody: function (body) {
      body = body == null ? "" : String(body);
      if (!/<[a-z!/][\s\S]*>/i.test(body)) {
        return body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
      }
      return sanitizeHtml(body);
    },
    sanitizeHtml: function (html) { return sanitizeHtml(html); },

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
          .then(function (r) {
            // Remember the token on this device too, so the published guide
            // can offer its creator a way back into editing.
            rememberToken(guide.slug, editToken);
            return { cloud: true };
          });
      });
    },

    // This device's edit token for a slug (recorded when the guide was
    // published or opened for editing here), or null. Purely local — holding
    // the token is what makes someone the owner.
    editTokenFor: function (slug) { return localTokens()[slug] || null; },
    rememberToken: function (slug, token) { rememberToken(slug, token); },

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
          "$question: String, $fileData: String, $fileType: String, " +
          "$fileDatas: [String], $fileTypes: [String]){ " +
          "aiAssist(mode: $mode, text: $text, category: $category, " +
          "question: $question, fileData: $fileData, fileType: $fileType, " +
          "fileDatas: $fileDatas, fileTypes: $fileTypes) }";
        return gql(cfg, q, {
          mode: mode,
          text: opts.text || null,
          category: opts.category || null,
          question: opts.question || null,
          fileData: opts.fileData || null,
          fileType: opts.fileType || null,
          fileDatas: opts.fileDatas && opts.fileDatas.length ? opts.fileDatas : null,
          fileTypes: opts.fileTypes && opts.fileTypes.length ? opts.fileTypes : null
        }).then(function (d) {
          var r = d.aiAssist;
          if (typeof r === "string") { try { return JSON.parse(r); } catch (e) { return r; } }
          return r;
        });
      });
    },

    // Transcribe a recorded audio Blob via Whisper (server-side). Resolves with
    // { ok, text } or { ok:false, error }, or null when there's no cloud backend.
    transcribe: function (blob, mime) {
      return loadConfig().then(function (cfg) {
        if (!cfg || !cfg.transcribeUrl) return null;
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onerror = function () { reject(new Error("Couldn't read the recording.")); };
          reader.onload = function () {
            var dataUrl = String(reader.result || "");
            var b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
            fetch(cfg.transcribeUrl, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ audio: b64, mime: mime || blob.type || "audio/webm" })
            }).then(function (r) { return r.json(); }).then(resolve, reject);
          };
          reader.readAsDataURL(blob);
        });
      });
    },

    // Read a public web page / Google Doc link server-side and return its text.
    // Resolves with { ok, title, text } or { ok:false, error }, or null offline.
    readUrl: function (url) {
      return loadConfig().then(function (cfg) {
        if (!cfg) return null;
        var q = "query R($url: String!){ readUrl(url: $url) }";
        return gql(cfg, q, { url: url }).then(function (d) {
          var r = d.readUrl;
          if (typeof r === "string") { try { return JSON.parse(r); } catch (e) { return null; } }
          return r;
        });
      });
    },

    // Request a one-time Cloudflare Stream direct-upload URL. Resolves with
    // { uploadURL, uid } (or { error }), or null when there's no cloud backend.
    videoUploadUrl: function (maxDurationSeconds) {
      return loadConfig().then(function (cfg) {
        if (!cfg) return null;
        var q = "query Vid($maxDurationSeconds: Int){ videoUpload(maxDurationSeconds: $maxDurationSeconds) }";
        return gql(cfg, q, { maxDurationSeconds: maxDurationSeconds || 150 }).then(function (d) {
          var r = d.videoUpload;
          if (typeof r === "string") { try { return JSON.parse(r); } catch (e) { return null; } }
          return r;
        });
      });
    },

    // Email a creator their links (server-side via SES). `opts`: email, slug,
    // editToken, origin, and optional title/emoji/password. Resolves with the
    // handler result, or null when there's no cloud backend to send through.
    sendLinks: function (opts) {
      opts = opts || {};
      return loadConfig().then(function (cfg) {
        if (!cfg) return null;
        var q = "query Send($email: String!, $slug: String!, $editToken: String!, " +
          "$origin: String!, $title: String, $emoji: String, $password: String){ " +
          "sendLinks(email: $email, slug: $slug, editToken: $editToken, origin: $origin, " +
          "title: $title, emoji: $emoji, password: $password) }";
        return gql(cfg, q, {
          email: opts.email,
          slug: opts.slug,
          editToken: opts.editToken,
          origin: opts.origin,
          title: opts.title || null,
          emoji: opts.emoji || null,
          password: opts.password || null
        }).then(function (d) {
          var r = d.sendLinks;
          if (typeof r === "string") { try { return JSON.parse(r); } catch (e) { return r; } }
          return r;
        });
      });
    },

    // Submit in-app feedback. `opts`: message, email, context. Stores to the
    // cloud when available, otherwise queues it in localStorage. Resolves with
    // { cloud: bool } so it never rejects on the caller for a missing backend.
    feedback: function (opts) {
      opts = opts || {};
      return loadConfig().then(function (cfg) {
        if (!cfg) {
          try {
            var list = JSON.parse(localStorage.getItem("how2_feedback") || "[]");
            list.push({ message: opts.message, email: opts.email, context: opts.context, at: Date.now() });
            localStorage.setItem("how2_feedback", JSON.stringify(list));
          } catch (e) {}
          return { cloud: false };
        }
        // Store durably (DynamoDB) and email the team. Both best-effort: as long
        // as one succeeds the feedback isn't lost. Email needs SES configured.
        var storeQ = "mutation Cr($input: CreateFeedbackInput!){ createFeedback(input: $input){ id } }";
        var stored = gql(cfg, storeQ, { input: {
          message: opts.message || "",
          email: opts.email || null,
          context: opts.context || null
        } }).then(function () { return true; }, function () { return false; });

        var mailQ = "query Fb($message: String!, $email: String, $context: String, $image: String, $imageType: String){ " +
          "sendFeedback(message: $message, email: $email, context: $context, image: $image, imageType: $imageType) }";
        var mailed = gql(cfg, mailQ, {
          message: opts.message || "",
          email: opts.email || null,
          context: opts.context || null,
          image: opts.image || null,
          imageType: opts.imageType || null
        }).then(function () { return true; }, function () { return false; });

        return Promise.all([stored, mailed]).then(function (r) {
          if (!r[0] && !r[1]) throw new Error("Couldn't submit feedback");
          return { cloud: true };
        });
      });
    },

    // Log a lightweight analytics event (kind: publish/view/share, + slug).
    // Best-effort and never rejects, so callers can fire-and-forget.
    event: function (kind, slug) {
      // Anonymous per-browser id so views can be counted unique-vs-total.
      var vid = null;
      try {
        vid = localStorage.getItem("gotit_vid");
        if (!vid) {
          var a = new Uint8Array(12); window.crypto.getRandomValues(a);
          vid = Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
          localStorage.setItem("gotit_vid", vid);
        }
      } catch (e) { vid = null; }
      // Where the visit came from: the referrer's domain only (never the full
      // URL). Same-site or no referrer both count as "direct".
      var ref = "direct";
      try {
        if (document.referrer) {
          var host = new URL(document.referrer).hostname;
          if (host && host !== window.location.hostname) ref = host.replace(/^www\./, "").slice(0, 80);
        }
      } catch (e) { /* keep "direct" */ }
      return loadConfig().then(function (cfg) {
        if (!cfg) return false;
        var q = "mutation Cr($input: CreateEventInput!){ createEvent(input: $input){ id } }";
        return gql(cfg, q, { input: { kind: kind, slug: slug || null, vid: vid, ref: ref } })
          .then(function () { return true; }, function () { return false; });
      }, function () { return false; });
    },

    // Sitter feedback left on a published guide → routed server-side to the
    // guide's owner (if it's saved to an account) or the team inbox. Resolves
    // { ok:true }, or null if the backend isn't available (rejects on failure).
    sendGuideFeedback: function (opts) {
      opts = opts || {};
      return loadConfig().then(function (cfg) {
        if (!cfg || !cfg.guideFeedbackUrl) return null;
        return fetch(cfg.guideFeedbackUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            slug: opts.slug || "", title: opts.title || "",
            message: opts.message || "", email: opts.email || ""
          })
        }).then(function (r) {
          if (r.status === 200) return r.json();
          throw new Error("Couldn't send feedback");
        });
      });
    },

    // Read aggregate analytics (passphrase-protected Lambda URL). Resolves with
    // the stats object, null if unavailable, or rejects on a wrong passphrase.
    stats: function (key) {
      return loadConfig().then(function (cfg) {
        if (!cfg || !cfg.statsUrl) return null;
        return fetch(cfg.statsUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key: key, tz: new Date().getTimezoneOffset() })
        }).then(function (r) {
          if (r.status === 200) return r.json();
          if (r.status === 401) throw new Error("wrong passphrase");
          if (r.status === 503) return null; // not configured yet
          throw new Error("stats unavailable");
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
