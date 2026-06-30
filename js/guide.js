/* ============================================================
   GotIt Guides — Published guide view (read-only)
   Loads a guide from localStorage by ?g=slug and renders it
   in the same style as the builder preview.
   ============================================================ */
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function uid() { return Math.random().toString(36).slice(2, 9); }
  // A friendly "now" stamp for new log entries, e.g. "Sat 28 Jun, 3:11 pm".
  function nowStamp() {
    try {
      return new Date().toLocaleString(undefined, {
        weekday: "short", day: "numeric", month: "short",
        hour: "numeric", minute: "2-digit"
      });
    } catch (e) { return new Date().toLocaleString(); }
  }
  // The guide code for a locked guide, kept so viewers can save log entries
  // back into the encrypted payload.
  var currentPassword = null;
  function findById(list, id) {
    list = list || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  // Re-fetch the latest guide, append one log entry, and save it back so every
  // viewer (and the owner) sees it. Re-encrypts locked guides with the code the
  // viewer entered. Calls done(true|false).
  function persistLogEntry(logId, entry, done) {
    if (!slug) { done(true); return; } // no backend — keep in memory only
    GotItStore.get(slug).then(function (obj) {
      if (!obj) throw new Error("missing");
      var encrypted = GotItStore.isEncrypted(obj);
      var getPlain = encrypted
        ? (currentPassword ? GotItStore.decrypt(obj, currentPassword) : Promise.reject(new Error("locked")))
        : Promise.resolve(obj);
      return getPlain.then(function (latest) {
        var log = findById(latest.logs, logId);
        if (!log) throw new Error("nolog");
        log.rows = log.rows || [];
        log.rows.push(entry);
        var toStore = encrypted ? GotItStore.encrypt(latest, currentPassword) : Promise.resolve(latest);
        return toStore.then(function (payload) { return GotItStore.update(payload); });
      });
    }).then(function () { done(true); }, function () { done(false); });
  }
  function getSlug() {
    // Pretty path: /g/<slug>
    var p = location.pathname.match(/\/g\/([^/?#]+)/);
    if (p) return decodeURIComponent(p[1]);
    // Legacy query string: ?g=<slug> (older shared links still work)
    var m = location.search.match(/[?&]g=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
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

  function render(guide) {
    if (!guide) {
    doc.innerHTML =
      '<div class="guide-cover"><span class="cover-emoji">🔍</span>' +
      '<div class="cover-title">Guide not found</div>' +
      '<div class="cover-sub">This guide may have been created on another device or browser.</div></div>' +
      '<p style="text-align:center;margin-top:24px"><a class="btn btn-primary" href="builder.html">Create a guide →</a></p>';
    document.title = "Guide not found — GotIt Guides";
    return;
  }

  document.title = guide.title + " — GotIt Guides";

  // Count a view (best-effort, no personal data — just the slug).
  if (slug && GotItStore.event) GotItStore.event("view", slug);

  var html = "";

  // Cover
  html +=
    '<div class="guide-cover">' +
      (guide.emoji ? '<span class="cover-emoji">' + guide.emoji + "</span>" : "") +
      '<div class="cover-title">' + esc(guide.title) + "</div>" +
      '<div class="cover-sub">' + esc(guide.subtitle) + "</div>" +
    "</div>";

  // ---- Block renderers ----
  var firstSectionOpen = true;
  function sectionHtml(sec) {
    var media = "";
    if (sec.photo) media += '<div class="sec-media"><img class="sec-photo" src="' + sec.photo + '" alt="" /></div>';
    var vsrc = sec.videoEmbed || (sec.videoId ? "https://www.youtube.com/embed/" + sec.videoId : null);
    if (vsrc) {
      media += '<div class="sec-media"><div class="sec-video"><iframe src="' + vsrc +
        '" allowfullscreen loading="lazy"></iframe></div>' +
        '<p class="print-only video-note">▶ Video — scan the QR code at the top to watch online.</p></div>';
    }
    var open = firstSectionOpen ? " open" : "";
    firstSectionOpen = false;
    return '<div class="guide-section' + open + '" data-sec="' + esc(sec.id) + '">' +
        '<button class="acc-header" type="button">' +
          (sec.icon ? '<span class="acc-icon">' + sec.icon + "</span>" : "") +
          '<span class="acc-title-text">' + esc(sec.title) + "</span>" +
          '<span class="acc-chevron">▾</span>' +
        "</button>" +
        '<div class="acc-body"><div class="acc-body-inner">' +
          '<div class="acc-content">' + GotItStore.renderBody(sec.body) + "</div>" +
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
  function fmt12(t) {
    var parts = String(t || "").split(":");
    var h = parseInt(parts[0], 10), m = parts[1] || "00";
    if (isNaN(h)) return t;
    var ap = h < 12 ? "am" : "pm", h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ":" + m + ap;
  }
  // Daily Routine timeline (Morning / Afternoon / Evening) + one button to add
  // the whole routine to the sitter's calendar.
  function routineHtml() {
    var r = guide.routine;
    if (!r || !r.items || !r.items.length) return "";
    var entries = [];
    r.items.forEach(function (it) {
      (it.times || []).forEach(function (t) { if (t) entries.push({ time: t, icon: it.icon || "", label: it.label || "" }); });
    });
    if (!entries.length) return "";
    entries.sort(function (a, b) { return a.time.localeCompare(b.time); });
    var groups = { morning: [], afternoon: [], evening: [] };
    entries.forEach(function (e) {
      var h = parseInt(e.time.split(":")[0], 10);
      if (h < 12) groups.morning.push(e); else if (h < 17) groups.afternoon.push(e); else groups.evening.push(e);
    });
    var periods = [["morning", "🌅 Morning"], ["afternoon", "☀️ Afternoon"], ["evening", "🌙 Evening"]];
    var s = '<div class="guide-routine"><div class="routine-head">⏰ Daily Routine</div>';
    periods.forEach(function (p) {
      var list = groups[p[0]];
      if (!list.length) return;
      s += '<div class="routine-period"><div class="routine-period-label">' + p[1] + "</div>";
      list.forEach(function (e) {
        s += '<div class="routine-entry">' +
          '<span class="routine-time">' + esc(fmt12(e.time)) + "</span>" +
          '<span class="routine-emoji">' + (e.icon ? esc(e.icon) : "•") + "</span>" +
          '<span class="routine-label">' + esc(e.label) + "</span>" +
          "</div>";
      });
      s += "</div>";
    });
    s += '<button class="reminder-cal-btn no-print" data-routine="1">📅 Add all reminders to my calendar</button>';
    return s + "</div>";
  }
  function logRowsHtml(log) {
    var rows = (log.rows || []).filter(function (r) { return r.when || r.note; });
    if (!rows.length) {
      return '<tr class="log-empty"><td colspan="2">No entries yet. Add the first one below.</td></tr>';
    }
    return rows.map(function (r) {
      return "<tr><td>" + esc(r.when) + "</td><td>" + esc(r.note) + "</td></tr>";
    }).join("");
  }
  function logHtml(log) {
    return '<div class="guide-log" data-log="' + esc(log.id) + '">' +
        '<div class="log-head">📓 ' + esc(log.title) + "</div>" +
        '<table class="log-table"><thead><tr><th>Date / time</th><th>Note</th></tr></thead>' +
          '<tbody class="log-rows">' + logRowsHtml(log) + "</tbody></table>" +
        '<div class="log-add">' +
          '<input type="text" class="q-input log-when" aria-label="When" placeholder="When" />' +
          '<input type="text" class="q-input log-note" aria-label="Note" placeholder="Add a note, e.g. seizure, fed, walked…" />' +
          '<button class="btn btn-primary btn-sm log-add-btn" type="button">Add entry</button>' +
        "</div>" +
        '<p class="log-add-msg" role="status" aria-live="polite" hidden></p>' +
      "</div>";
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
    else if (tok === "r") { html += routineHtml(); done.r = true; }
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
  if (!done.r) html += routineHtml();
  (guide.logs || []).forEach(function (log) { if (!done["l:" + log.id]) html += logHtml(log); });

  doc.innerHTML = html;

  // Cover photo (set via JS to avoid escaping the data URL in an attribute).
  // A cover photo always wins; otherwise an optional accent colour recolours it.
  var coverEl = doc.querySelector(".guide-cover");
  if (coverEl && !guide.emoji) coverEl.classList.add("no-emoji"); // title sits up top, clear of the photo subject
  if (guide.cover) {
    if (coverEl) {
      coverEl.classList.add("has-cover");
      coverEl.style.backgroundImage =
        "linear-gradient(180deg, rgba(26,26,26,0.28), rgba(26,26,26,0.55)), url(" + guide.cover + ")";
    }
  } else if (guide.coverColor) {
    GotItStore.applyCoverAccent(coverEl, guide.coverColor);
  }

  // Per-block accent colours
  doc.querySelectorAll(".guide-section[data-sec]").forEach(function (el) {
    var sec = byId(guide.sections, el.getAttribute("data-sec"));
    if (sec && sec.color) GotItStore.applyAccent(el, sec.color);
  });
  doc.querySelectorAll(".guide-log[data-log]").forEach(function (el) {
    var log = byId(guide.logs, el.getAttribute("data-log"));
    if (log && log.color) GotItStore.applyAccent(el, log.color);
  });
  if (guide.emergencyColor) {
    var emgEl = doc.querySelector(".guide-emergency");
    if (emgEl) GotItStore.applyAccent(emgEl, guide.emergencyColor);
  }

  // Accordion behaviour
  doc.querySelectorAll(".guide-section").forEach(function (sec) {
    sec.querySelector(".acc-header").addEventListener("click", function () {
      sec.classList.toggle("open");
    });
  });

  // "Add all reminders to my calendar" on the Daily Routine widget.
  doc.querySelectorAll(".reminder-cal-btn[data-routine]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      openRoutineModal(guide);
    });
  });

  // Interactive logs: let a viewer (sitter, carer, guest) record entries that
  // save back into the guide so everyone sees the latest.
  doc.querySelectorAll(".guide-log").forEach(function (logEl) {
    var log = byId(guide.logs, logEl.getAttribute("data-log"));
    if (!log) return;
    var whenInp = logEl.querySelector(".log-when");
    var noteInp = logEl.querySelector(".log-note");
    var btn = logEl.querySelector(".log-add-btn");
    var msg = logEl.querySelector(".log-add-msg");
    var rowsBody = logEl.querySelector(".log-rows");
    whenInp.value = nowStamp();

    function addEntry() {
      var note = noteInp.value.trim();
      if (!note) { noteInp.focus(); return; }
      var entry = { id: uid(), when: whenInp.value.trim() || nowStamp(), note: note };
      btn.disabled = true;
      var label = btn.textContent; btn.textContent = "Saving…";
      msg.hidden = true;
      // Optimistically show it, then persist.
      log.rows = log.rows || [];
      log.rows.push(entry);
      rowsBody.innerHTML = logRowsHtml(log);
      persistLogEntry(log.id, entry, function (ok) {
        btn.disabled = false; btn.textContent = label;
        if (ok) {
          noteInp.value = ""; whenInp.value = nowStamp(); noteInp.focus();
          msg.textContent = "Saved ✓"; msg.className = "log-add-msg ok"; msg.hidden = false;
          setTimeout(function () { msg.hidden = true; }, 2500);
        } else {
          log.rows = log.rows.filter(function (x) { return x.id !== entry.id; });
          rowsBody.innerHTML = logRowsHtml(log);
          msg.textContent = "Couldn't save — check your connection and try again.";
          msg.className = "log-add-msg err"; msg.hidden = false;
        }
      });
    }
    btn.addEventListener("click", addEntry);
    noteInp.addEventListener("keydown", function (e) { if (e.key === "Enter") addEntry(); });
  });

  // Footer (GotIt Guides branding for free tier)
  if (guide.branding !== false) {
    footer.innerHTML = 'Made with <a href="index.html">GotIt Guides</a> · guides people get';
  } else {
    footer.innerHTML = "";
  }

  setupPrint(guide);
  }

  // ---- Print / Save-as-PDF (browser-native; a print stylesheet reflows the
  // guide onto A4). Adds a compact print-only header with a QR back to the
  // live guide so the paper copy always points to videos + the latest version.
  function setupPrint(guide) {
    // Canonical pretty URL for the QR, however the page was opened.
    var liveUrl = slug ? (location.origin + "/g/" + encodeURIComponent(slug))
                       : (location.origin + location.pathname);
    if (!doc.querySelector(".print-header")) {
      var h = document.createElement("div");
      h.className = "print-header print-only";
      h.innerHTML =
        '<div class="print-head-text">' +
          '<span class="print-emoji">' + esc(guide.emoji) + "</span>" +
          "<div><div class=\"print-title\">" + esc(guide.title) + "</div>" +
          '<div class="print-sub">' + esc(guide.subtitle || "") + "</div></div>" +
        "</div>" +
        '<div class="print-qr"><div id="printQr"></div>' +
          '<span class="print-qr-label">📱 Scan for videos<br>& the latest version</span></div>';
      doc.insertBefore(h, doc.firstChild);
      if (window.QRCode) {
        try {
          new QRCode(document.getElementById("printQr"),
            { text: liveUrl, width: 96, height: 96, correctLevel: QRCode.CorrectLevel.M });
        } catch (e) {}
      }
    }
    if (!document.getElementById("printFab")) {
      var b = document.createElement("button");
      b.id = "printFab";
      b.className = "print-fab no-print";
      b.type = "button";
      b.textContent = "🖨️ Print / Save as PDF";
      b.addEventListener("click", function () { window.print(); });
      document.body.appendChild(b);
    }
    // Opened from the share screen's "Printable version" link → print straight away.
    if (/[?&]print=1/.test(location.search)) {
      setTimeout(function () { window.print(); }, 700);
    }
  }

  /* ---------- Add-to-calendar reminders (sitter side) ----------
     Turns a section's reminder times into a downloadable .ics calendar file
     with a daily-recurring event (plus an alert) at each time, across the days
     the sitter is caring. Works on any phone, no login or backend. */
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function isoFromToday(off) {
    var d = new Date(); d.setDate(d.getDate() + (off || 0));
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function escICS(s) {
    return String(s == null ? "" : s)
      .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  }
  // opts.events: [{ summary, time }]. One daily-recurring VEVENT (with an alert)
  // per event, from startDate to endDate.
  function buildICS(opts) {
    function dtLocal(dateStr, timeStr) {
      return dateStr.replace(/-/g, "") + "T" + (timeStr || "00:00").replace(/:/g, "") + "00";
    }
    function stampUTC() {
      var n = new Date();
      return n.getUTCFullYear() + pad2(n.getUTCMonth() + 1) + pad2(n.getUTCDate()) + "T" +
        pad2(n.getUTCHours()) + pad2(n.getUTCMinutes()) + pad2(n.getUTCSeconds()) + "Z";
    }
    var until = opts.endDate.replace(/-/g, "") + "T235959";
    var L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GotIt Guides//Care Reminders//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
    opts.events.forEach(function (ev, i) {
      var uid = Date.now().toString(36) + "-" + i + "-" + Math.random().toString(36).slice(2, 8) + "@gotitguides.com";
      L.push("BEGIN:VEVENT", "UID:" + uid, "DTSTAMP:" + stampUTC(), "DTSTART:" + dtLocal(opts.startDate, ev.time),
        "DURATION:PT10M", "RRULE:FREQ=DAILY;UNTIL=" + until, "SUMMARY:" + escICS(ev.summary));
      if (opts.description) L.push("DESCRIPTION:" + escICS(opts.description));
      L.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + escICS(ev.summary), "TRIGGER:PT0S", "END:VALARM", "END:VEVENT");
    });
    L.push("END:VCALENDAR");
    return L.join("\r\n");
  }
  function downloadICS(filename, ics) {
    var blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
  }
  function slugifyName(s) {
    return String(s || "reminders").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "reminders";
  }
  function closeReminderModal() {
    var m = document.getElementById("remModal");
    if (m && m.parentNode) m.parentNode.removeChild(m);
  }
  function openRoutineModal(guide) {
    closeReminderModal();
    var r = guide.routine || { items: [] };
    function f12(t) {
      var pp = String(t || "").split(":"); var h = parseInt(pp[0], 10), m = pp[1] || "00";
      if (isNaN(h)) return t; var ap = h < 12 ? "am" : "pm", h12 = h % 12 || 12; return h12 + ":" + m + ap;
    }
    function buildEvents() {
      var events = [];
      (r.items || []).forEach(function (it) {
        (it.times || []).forEach(function (t) {
          if (t) events.push({ summary: (it.icon ? it.icon + " " : "") + (it.label || "Reminder") + " · " + (guide.title || "GotIt guide"), time: t });
        });
      });
      return events;
    }

    var overlay = document.createElement("div");
    overlay.className = "rem-modal"; overlay.id = "remModal";
    var backdrop = document.createElement("div");
    backdrop.className = "rem-backdrop";
    backdrop.addEventListener("click", closeReminderModal);
    var card = document.createElement("div");
    card.className = "rem-card";

    var x = document.createElement("button");
    x.className = "rem-x"; x.type = "button"; x.textContent = "×";
    x.addEventListener("click", closeReminderModal);

    var h = document.createElement("h3");
    h.className = "rem-title";
    h.textContent = "Add the daily routine to your calendar";
    var p = document.createElement("p");
    p.className = "rem-lead";
    p.textContent = "Pick the days you're caring and we'll add every reminder, each with an alert.";

    // Read-only summary of what's being added.
    var summary = document.createElement("div");
    summary.className = "rem-summary";
    (r.items || []).forEach(function (it) {
      if (!(it.times && it.times.length)) return;
      var row = document.createElement("div"); row.className = "rem-summary-row";
      row.textContent = (it.icon ? it.icon + " " : "") + (it.label || "") + " — " + it.times.map(f12).join(", ");
      summary.appendChild(row);
    });

    function field(labelText, input) {
      var w = document.createElement("div"); w.className = "rem-field";
      var l = document.createElement("label"); l.textContent = labelText;
      w.appendChild(l); w.appendChild(input); return w;
    }
    var start = document.createElement("input");
    start.type = "date"; start.className = "q-input"; start.value = isoFromToday(0);
    var end = document.createElement("input");
    end.type = "date"; end.className = "q-input"; end.value = isoFromToday(6);
    var dates = document.createElement("div"); dates.className = "rem-dates";
    dates.appendChild(field("From", start));
    dates.appendChild(field("To", end));

    var note = document.createElement("p"); note.className = "rem-note"; note.hidden = true;
    var actions = document.createElement("div"); actions.className = "rem-actions";
    var cancel = document.createElement("button");
    cancel.type = "button"; cancel.className = "btn btn-ghost btn-sm"; cancel.textContent = "Cancel";
    cancel.addEventListener("click", closeReminderModal);
    var go = document.createElement("button");
    go.type = "button"; go.className = "btn btn-primary btn-sm"; go.textContent = "Add to my calendar";
    go.addEventListener("click", function () {
      var events = buildEvents();
      if (!events.length) { note.hidden = false; note.className = "rem-note err"; note.textContent = "This routine has no times yet."; return; }
      if (start.value && end.value && end.value < start.value) {
        note.hidden = false; note.className = "rem-note err"; note.textContent = "The end date is before the start date."; return;
      }
      var liveUrl = slug ? (location.origin + "/g/" + encodeURIComponent(slug)) : location.href;
      var ics = buildICS({
        events: events,
        description: "From your GotIt guide: " + liveUrl,
        startDate: start.value || isoFromToday(0),
        endDate: end.value || start.value || isoFromToday(6)
      });
      downloadICS(slugifyName(guide.title) + "-routine.ics", ics);
      note.hidden = false; note.className = "rem-note ok";
      note.textContent = "Opening your calendar… confirm there to add the reminders.";
      go.disabled = true;
      setTimeout(closeReminderModal, 2000);
    });
    actions.appendChild(cancel); actions.appendChild(go);

    card.appendChild(x); card.appendChild(h); card.appendChild(p);
    if (summary.children.length) card.appendChild(summary);
    card.appendChild(dates);
    card.appendChild(actions); card.appendChild(note);
    overlay.appendChild(backdrop); overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  // Locked guides arrive as an encrypted envelope — show an unlock screen and
  // decrypt in the browser once the right guide code is entered.
  function showLock(env) {
    document.title = "Locked guide — GotIt Guides";
    doc.innerHTML =
      '<div class="guide-cover"><span class="cover-emoji">🔒</span>' +
        '<div class="cover-title">This guide is locked</div>' +
        '<div class="cover-sub">Enter the guide code to open it.</div></div>' +
      '<div class="lock-screen">' +
        '<input type="password" id="unlockPass" class="q-input" placeholder="Guide code" autocomplete="off" />' +
        '<button class="btn btn-primary" id="unlockBtn" type="button">Unlock</button>' +
        '<p class="lock-error" id="unlockErr" hidden>That code\'s not right — try again.</p>' +
      "</div>";
    var input = document.getElementById("unlockPass");
    var btn = document.getElementById("unlockBtn");
    var err = document.getElementById("unlockErr");
    function attempt() {
      var p = input.value;
      if (!p) return;
      err.hidden = true;
      btn.disabled = true; btn.textContent = "Unlocking…";
      GotItStore.decrypt(env, p).then(function (real) {
        currentPassword = p;
        render(real);
      }, function () {
        err.hidden = false;
        btn.disabled = false; btn.textContent = "Unlock";
        input.select();
      });
    }
    btn.addEventListener("click", attempt);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") attempt(); });
    setTimeout(function () { input.focus(); }, 50);
  }

  // Load the guide (cloud or local), then render (or prompt to unlock).
  if (!slug) {
    render(null);
  } else {
    doc.innerHTML = '<div class="guide-cover"><span class="cover-emoji">⏳</span>' +
      '<div class="cover-title">Loading…</div></div>';
    GotItStore.get(slug).then(function (obj) {
      if (GotItStore.isEncrypted(obj)) showLock(obj);
      else render(obj);
    }).catch(function () { render(null); });
  }
})();
