/* ============================================================
   How2 — Guide builder
   Wizard: category → questions → preview/edit → share
   Persists guides to localStorage (no backend for MVP).
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Storage helpers ---------- */
  var STORE_KEY = "how2_guides";
  function loadGuides() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); }
    catch (e) { return {}; }
  }
  function saveGuide(guide) {
    var all = loadGuides();
    all[guide.slug] = guide;
    localStorage.setItem(STORE_KEY, JSON.stringify(all));
  }
  function makeSlug() {
    var words = ["sunny", "cosy", "happy", "swift", "calm", "bright", "lucky", "warm"];
    var w = words[Math.floor(Math.random() * words.length)];
    return w + "-" + Math.random().toString(36).slice(2, 8);
  }
  function uid() { return Math.random().toString(36).slice(2, 9); }

  /* ---------- Category flows ----------
     Each question maps into the generated guide via `target`:
       section  → becomes a collapsible section (needs icon + sectionTitle)
       emergency → feeds the emergency contacts block
       title    → guide cover title
       subtitle → guide cover subtitle
     Questions can use {name} token (filled from the question marked usesName).
  */
  var CATEGORIES = [
    {
      id: "pet", emoji: "🐶", name: "Pet Care", desc: "Sitter-ready",
      coverSub: "Everything my pet sitter needs to know",
      questions: [
        { id: "name", q: "What's your pet's name?", hint: "We'll title the guide after them.", ph: "e.g. Whiskey", type: "text", target: "title", titleSuffix: " 101" },
        { id: "breedAge", q: "What breed and age?", hint: "", ph: "e.g. Border Collie, 3 years", type: "text", target: "section", icon: "🐾", sectionTitle: "About {name}" },
        { id: "routine", q: "What's the daily routine?", hint: "Morning, midday and evening — feeding, walks, naps.", ph: "Morning: …\nMidday: …\nEvening: …", type: "textarea", target: "section", icon: "🦴", sectionTitle: "Daily Routine" },
        { id: "medical", q: "Any medical conditions or medications?", hint: "Doses, timing, where it's kept.", ph: "e.g. Half a tablet with breakfast…", type: "textarea", target: "section", icon: "💊", sectionTitle: "Health & Medications" },
        { id: "emergency", q: "Any emergency contacts?", hint: "Vet, and a backup human.", ph: "Vet: Dr Smith — 0400 000 000\nMe: …", type: "textarea", target: "emergency" },
        { id: "extra", q: "Anything else the carer needs to know?", hint: "Quirks, fears, favourite things.", ph: "e.g. Scared of thunder, loves belly rubs…", type: "textarea", target: "section", icon: "💡", sectionTitle: "Good to Know" }
      ]
    },
    {
      id: "home", emoji: "🏠", name: "Home / Airbnb", desc: "For guests",
      coverSub: "Your guide to a great stay",
      questions: [
        { id: "name", q: "What should we call this place?", hint: "Shown on the cover.", ph: "e.g. The Beach House", type: "text", target: "title" },
        { id: "checkin", q: "How do guests get in?", hint: "Keys, lockbox code, parking.", ph: "Lockbox code 1234, by the front door…", type: "textarea", target: "section", icon: "🔑", sectionTitle: "Getting In & Parking" },
        { id: "wifi", q: "Wi-Fi & essentials?", hint: "Network, password, thermostat, TV.", ph: "Wi-Fi: BeachHouse / pass: …", type: "textarea", target: "section", icon: "📶", sectionTitle: "Wi-Fi & Essentials" },
        { id: "house", q: "Any house rules or quirks?", hint: "Bins, quiet hours, that tricky tap.", ph: "Bins out Tuesday, no shoes inside…", type: "textarea", target: "section", icon: "📋", sectionTitle: "House Rules & Quirks" },
        { id: "local", q: "Local recommendations?", hint: "Coffee, food, things to do.", ph: "Best coffee: …\nDinner: …", type: "textarea", target: "section", icon: "📍", sectionTitle: "Local Favourites" },
        { id: "emergency", q: "Who do they call if something breaks?", hint: "You or a manager, plus emergency.", ph: "Host: 0400 000 000\nEmergency: 000", type: "textarea", target: "emergency" }
      ]
    },
    {
      id: "kids", emoji: "👶", name: "Kids & Babysitting", desc: "Carer-ready",
      coverSub: "Everything the carer needs to know",
      questions: [
        { id: "name", q: "Whose guide is this?", hint: "A child's name, or 'The Kids'.", ph: "e.g. Mia & Leo", type: "text", target: "title", titleSuffix: "'s Guide" },
        { id: "routine", q: "What's the daily routine?", hint: "Meals, naps, school, bedtime.", ph: "Lunch 12pm, nap 1pm, bed 7pm…", type: "textarea", target: "section", icon: "🕐", sectionTitle: "Routine & Bedtime" },
        { id: "food", q: "Food, allergies & dislikes?", hint: "What they eat — and must avoid.", ph: "Allergic to peanuts. Loves pasta…", type: "textarea", target: "section", icon: "🍎", sectionTitle: "Food & Allergies" },
        { id: "rules", q: "House rules & screen time?", hint: "Boundaries that help.", ph: "Max 30 min TV, no snacks after 6…", type: "textarea", target: "section", icon: "📺", sectionTitle: "Rules & Screen Time" },
        { id: "emergency", q: "Emergency contacts?", hint: "Parents, a backup, doctor.", ph: "Mum: …\nDad: …\nDoctor: …", type: "textarea", target: "emergency" },
        { id: "extra", q: "Anything else that helps?", hint: "Comfort items, fears, favourites.", ph: "Leo needs his bear to sleep…", type: "textarea", target: "section", icon: "💡", sectionTitle: "Good to Know" }
      ]
    },
    {
      id: "staff", emoji: "🧑‍💼", name: "Staff Onboarding", desc: "First week",
      coverSub: "Your first week, made simple",
      questions: [
        { id: "name", q: "What's this onboarding for?", hint: "Role or team name.", ph: "e.g. Barista Onboarding", type: "text", target: "title" },
        { id: "welcome", q: "A short welcome & what the role is about?", hint: "Set the tone.", ph: "Welcome to the team! Your role is…", type: "textarea", target: "section", icon: "👋", sectionTitle: "Welcome" },
        { id: "firstday", q: "What happens on day one?", hint: "Arrival, who to find, logins.", ph: "Arrive 9am, ask for Sam…", type: "textarea", target: "section", icon: "📅", sectionTitle: "Your First Day" },
        { id: "tools", q: "Tools & systems they'll use?", hint: "Apps, logins, where things live.", ph: "Slack, the POS, the roster app…", type: "textarea", target: "section", icon: "🛠️", sectionTitle: "Tools & Systems" },
        { id: "who", q: "Key people & contacts?", hint: "Who to ask for what.", ph: "Manager: …\nHR: …\nIT: …", type: "emergency" },
        { id: "extra", q: "Anything else for week one?", hint: "Norms, dress code, lunch spots.", ph: "We dress casual, lunch is at 1…", type: "textarea", target: "section", icon: "💡", sectionTitle: "Good to Know" }
      ]
    },
    {
      id: "event", emoji: "🎉", name: "Event", desc: "Guests & helpers",
      coverSub: "Everything you need for the day",
      questions: [
        { id: "name", q: "What's the event?", hint: "Shown on the cover.", ph: "e.g. Sam & Alex's Wedding", type: "text", target: "title" },
        { id: "when", q: "When & where?", hint: "Date, time, address.", ph: "Sat 12 July, 3pm — The Garden, 12 Rose St", type: "textarea", target: "section", icon: "📍", sectionTitle: "When & Where" },
        { id: "schedule", q: "What's the run sheet?", hint: "Order of the day.", ph: "3pm ceremony, 4pm photos, 6pm dinner…", type: "textarea", target: "section", icon: "🗓️", sectionTitle: "Run Sheet" },
        { id: "details", q: "Anything guests should know?", hint: "Dress code, parking, gifts.", ph: "Dress: cocktail. Parking on Rose St…", type: "textarea", target: "section", icon: "📋", sectionTitle: "Good to Know" },
        { id: "emergency", q: "Who to contact on the day?", hint: "Organiser or coordinator.", ph: "Coordinator: …\nVenue: …", type: "emergency" }
      ]
    },
    {
      id: "other", emoji: "✏️", name: "Other", desc: "Custom guide",
      coverSub: "A How2 guide",
      questions: [
        { id: "name", q: "What's your guide about?", hint: "This becomes the title.", ph: "e.g. How to use the espresso machine", type: "text", target: "title" },
        { id: "intro", q: "Give a short intro.", hint: "What is this and who's it for?", ph: "A quick guide to…", type: "textarea", target: "section", icon: "📖", sectionTitle: "Overview" },
        { id: "steps", q: "What are the main steps or sections?", hint: "One per line is fine.", ph: "Step 1…\nStep 2…", type: "textarea", target: "section", icon: "✅", sectionTitle: "Steps" },
        { id: "tips", q: "Any tips or things to watch out for?", hint: "", ph: "Don't forget to…", type: "textarea", target: "section", icon: "💡", sectionTitle: "Tips" },
        { id: "contact", q: "Who can help if stuck?", hint: "Optional.", ph: "Name — phone / email", type: "emergency" }
      ]
    }
  ];

  /* ---------- App state ---------- */
  var state = {
    category: null,
    qIndex: 0,
    answers: {},
    guide: null
  };

  /* ---------- DOM refs ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var steps = {
    1: $("step1"), 2: $("step2"), building: $("stepBuilding"),
    3: $("step3"), 4: $("step4")
  };
  var toast = $("toast");

  function showStep(key) {
    Object.keys(steps).forEach(function (k) { steps[k].classList.remove("active"); });
    steps[key].classList.add("active");
    // progress dots
    var stepNum = steps[key].getAttribute("data-step");
    document.querySelectorAll(".wizard-progress .dot").forEach(function (d) {
      var n = d.getAttribute("data-step");
      d.classList.toggle("active", n === stepNum);
      d.classList.toggle("done", Number(n) < Number(stepNum));
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toast.classList.remove("show"); }, 2200);
  }

  /* ---------- Step 1: render category cards ---------- */
  function renderCategories() {
    var grid = $("catGrid");
    grid.innerHTML = "";
    CATEGORIES.forEach(function (cat) {
      var btn = document.createElement("button");
      btn.className = "cat-card";
      btn.type = "button";
      btn.innerHTML =
        '<span class="cat-emoji">' + cat.emoji + "</span>" +
        '<div class="cat-name">' + cat.name + "</div>" +
        '<div class="cat-desc">' + cat.desc + "</div>";
      btn.addEventListener("click", function () { pickCategory(cat); });
      grid.appendChild(btn);
    });
  }

  function pickCategory(cat) {
    state.category = cat;
    state.qIndex = 0;
    state.answers = {};
    renderQuestion();
    showStep(2);
  }

  /* ---------- Step 2: question flow ---------- */
  function renderQuestion() {
    var cat = state.category;
    var qs = cat.questions;
    var i = state.qIndex;
    var q = qs[i];

    $("qBarFill").style.width = ((i) / qs.length * 100) + "%";
    $("qCount").textContent = "Question " + (i + 1) + " of " + qs.length;
    $("qTitle").textContent = fillName(q.q);
    $("qHint").textContent = q.hint || "";

    var wrap = $("qFieldWrap");
    wrap.innerHTML = "";
    var field;
    if (q.type === "textarea") {
      field = document.createElement("textarea");
      field.className = "q-textarea";
    } else {
      field = document.createElement("input");
      field.type = "text";
      field.className = "q-input";
    }
    field.id = "qField";
    field.placeholder = q.ph || "";
    field.value = state.answers[q.id] || "";
    wrap.appendChild(field);
    setTimeout(function () { field.focus(); }, 50);

    // Enter advances on single-line inputs
    field.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && q.type !== "textarea") { e.preventDefault(); nextQuestion(); }
    });

    // On the first question, Back returns to the landing page; otherwise it
    // steps to the previous question.
    $("qBack").textContent = i === 0 ? "← Home" : "← Back";
    $("qNext").textContent = i === qs.length - 1 ? "Build my guide →" : "Next →";
  }

  function fillName(str) {
    var nameAns = "";
    state.category.questions.forEach(function (q) {
      if (q.target === "title" && state.answers[q.id]) nameAns = state.answers[q.id];
    });
    return str.replace(/\{name\}/g, nameAns || "them");
  }

  function captureAnswer() {
    var q = state.category.questions[state.qIndex];
    var field = $("qField");
    if (field) state.answers[q.id] = field.value.trim();
  }

  function nextQuestion() {
    captureAnswer();
    if (state.qIndex < state.category.questions.length - 1) {
      state.qIndex++;
      renderQuestion();
    } else {
      buildGuide();
    }
  }
  function prevQuestion() {
    captureAnswer();
    if (state.qIndex > 0) {
      state.qIndex--;
      renderQuestion();
    } else {
      // First question of the category — go back to the home page.
      window.location.href = "index.html";
    }
  }

  /* ---------- Generate guide from answers ---------- */
  function buildGuide() {
    showStep("building");

    var cat = state.category;
    var title = "My " + cat.name + " Guide";
    var sections = [];
    var contacts = [];

    cat.questions.forEach(function (q) {
      var val = state.answers[q.id] || "";
      if (q.target === "title") {
        if (val) title = val + (q.titleSuffix || "");
      } else if (q.target === "subtitle") {
        // reserved
      } else if (q.target === "emergency") {
        parseContacts(val).forEach(function (c) { contacts.push(c); });
      } else if (q.target === "section") {
        sections.push({
          id: uid(),
          icon: q.icon || "📄",
          title: fillName(q.sectionTitle || q.q),
          body: val || "Tap to add details…",
          photo: null,
          videoId: null
        });
      }
    });

    state.guide = {
      slug: makeSlug(),
      category: cat.id,
      emoji: cat.emoji,
      title: title,
      subtitle: cat.coverSub,
      sections: sections,
      contacts: contacts,
      logs: [],
      branding: true,
      createdAt: Date.now()
    };

    // brief "building" pause for effect
    setTimeout(function () {
      renderGuideEditor();
      showStep(3);
    }, 1300);
  }

  // Turn free text like "Vet: Dr Smith — 0400" into {label, value} rows.
  function parseContacts(text) {
    if (!text) return [];
    return text.split("\n").map(function (line) {
      line = line.trim();
      if (!line) return null;
      var m = line.match(/^([^:–—-]{1,30})[:–—-]\s*(.+)$/);
      if (m) return { id: uid(), label: m[1].trim(), value: m[2].trim() };
      return { id: uid(), label: "Contact", value: line };
    }).filter(Boolean);
  }

  /* ---------- Step 3: render editable guide ---------- */
  function renderGuideEditor() {
    var g = state.guide;
    var doc = $("guideDoc");
    doc.innerHTML = "";

    // Cover
    var cover = document.createElement("div");
    cover.className = "guide-cover";
    cover.innerHTML =
      '<span class="cover-emoji">' + g.emoji + "</span>" +
      '<div class="cover-title" contenteditable="true" data-bind="title">' + esc(g.title) + "</div>" +
      '<div class="cover-sub" contenteditable="true" data-bind="subtitle">' + esc(g.subtitle) + "</div>";
    bindEditable(cover.querySelector('[data-bind="title"]'), function (v) { g.title = v; });
    bindEditable(cover.querySelector('[data-bind="subtitle"]'), function (v) { g.subtitle = v; });
    doc.appendChild(cover);

    // Sections
    g.sections.forEach(function (sec, idx) {
      doc.appendChild(buildSectionEl(sec, idx === 0));
    });

    // Emergency block (always available)
    doc.appendChild(buildEmergencyEl());

    // Logs
    g.logs.forEach(function (log) { doc.appendChild(buildLogEl(log)); });
  }

  function buildSectionEl(sec, openFirst) {
    var el = document.createElement("div");
    el.className = "guide-section" + (openFirst ? " open" : "");
    el.dataset.id = sec.id;

    el.innerHTML =
      '<button class="acc-header" type="button">' +
        '<span class="acc-icon">' + sec.icon + "</span>" +
        '<span class="acc-title-text" contenteditable="true">' + esc(sec.title) + "</span>" +
        '<span class="acc-chevron">▾</span>' +
      "</button>" +
      '<div class="acc-body"><div class="acc-body-inner">' +
        '<div class="acc-content" contenteditable="true">' + esc(sec.body) + "</div>" +
        '<div class="sec-media"></div>' +
        '<div class="video-input-row" style="display:none">' +
          '<input type="text" placeholder="Paste a YouTube link…" />' +
          '<button class="btn btn-primary btn-sm" type="button">Embed</button>' +
        "</div>" +
        '<div class="sec-tools">' +
          '<button class="tool-btn" data-act="photo" type="button">📸 Photo</button>' +
          '<button class="tool-btn" data-act="video" type="button">🎬 Video</button>' +
          '<button class="tool-btn danger" data-act="remove" type="button">🗑 Remove</button>' +
        "</div>" +
      "</div></div>";

    // Accordion toggle (ignore clicks on the editable title)
    var header = el.querySelector(".acc-header");
    header.addEventListener("click", function (e) {
      if (e.target.classList.contains("acc-title-text")) return;
      el.classList.toggle("open");
    });

    bindEditable(el.querySelector(".acc-title-text"), function (v) { sec.title = v; });
    bindEditable(el.querySelector(".acc-content"), function (v) { sec.body = v; });

    renderSectionMedia(el, sec);

    // Tools
    var tools = el.querySelector(".sec-tools");
    tools.querySelector('[data-act="remove"]').addEventListener("click", function () {
      state.guide.sections = state.guide.sections.filter(function (s) { return s.id !== sec.id; });
      el.remove();
    });
    var photoBtn = tools.querySelector('[data-act="photo"]');
    photoBtn.addEventListener("click", function () { pickPhoto(sec, el); });

    var videoRow = el.querySelector(".video-input-row");
    tools.querySelector('[data-act="video"]').addEventListener("click", function () {
      videoRow.style.display = videoRow.style.display === "none" ? "flex" : "none";
      if (videoRow.style.display === "flex") videoRow.querySelector("input").focus();
    });
    videoRow.querySelector("button").addEventListener("click", function () {
      var url = videoRow.querySelector("input").value.trim();
      var id = parseYouTube(url);
      if (!id) { showToast("Hmm, that doesn't look like a YouTube link."); return; }
      sec.videoId = id;
      videoRow.querySelector("input").value = "";
      videoRow.style.display = "none";
      renderSectionMedia(el, sec);
      if (!el.classList.contains("open")) el.classList.add("open");
    });

    return el;
  }

  function renderSectionMedia(el, sec) {
    var media = el.querySelector(".sec-media");
    media.innerHTML = "";
    if (sec.photo) {
      var fig = document.createElement("div");
      fig.innerHTML = '<img class="sec-photo" src="' + sec.photo + '" alt="" />';
      var rm = document.createElement("button");
      rm.className = "tool-btn danger";
      rm.type = "button";
      rm.textContent = "Remove photo";
      rm.addEventListener("click", function () { sec.photo = null; renderSectionMedia(el, sec); });
      fig.appendChild(rm);
      media.appendChild(fig);
    }
    if (sec.videoId) {
      var v = document.createElement("div");
      v.className = "sec-video";
      v.innerHTML = '<iframe src="https://www.youtube.com/embed/' + sec.videoId +
        '" allowfullscreen loading="lazy"></iframe>';
      media.appendChild(v);
    }
  }

  function pickPhoto(sec, el) {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", function () {
      var file = input.files[0];
      if (!file) return;
      if (file.size > 2.5 * 1024 * 1024) { showToast("Image is a bit large — try one under 2.5MB."); }
      var reader = new FileReader();
      reader.onload = function () {
        sec.photo = reader.result;
        renderSectionMedia(el, sec);
        if (!el.classList.contains("open")) el.classList.add("open");
      };
      reader.readAsDataURL(file);
    });
    input.click();
  }

  function buildEmergencyEl() {
    var g = state.guide;
    var el = document.createElement("div");
    el.className = "guide-emergency";
    el.innerHTML = '<div class="em-head">🚨 Emergency Contacts</div>';
    var list = document.createElement("div");
    list.className = "em-list";
    el.appendChild(list);

    function renderRows() {
      list.innerHTML = "";
      if (!g.contacts.length) {
        var empty = document.createElement("p");
        empty.style.color = "var(--ink-muted)";
        empty.style.fontSize = "0.9rem";
        empty.textContent = "No contacts yet — add one below.";
        list.appendChild(empty);
      }
      g.contacts.forEach(function (c) {
        var row = document.createElement("div");
        row.className = "contact-row";
        row.innerHTML =
          '<span class="contact-label" contenteditable="true">' + esc(c.label) + "</span>" +
          '<span class="contact-value" contenteditable="true">' + esc(c.value) + "</span>" +
          '<button class="contact-del" type="button" title="Remove">✕</button>';
        bindEditable(row.querySelector(".contact-label"), function (v) { c.label = v; });
        bindEditable(row.querySelector(".contact-value"), function (v) { c.value = v; });
        row.querySelector(".contact-del").addEventListener("click", function () {
          g.contacts = g.contacts.filter(function (x) { return x.id !== c.id; });
          renderRows();
        });
        list.appendChild(row);
      });
    }
    renderRows();

    var add = document.createElement("button");
    add.className = "tool-btn";
    add.type = "button";
    add.textContent = "＋ Add contact";
    add.style.marginTop = "12px";
    add.addEventListener("click", function () {
      g.contacts.push({ id: uid(), label: "Name", value: "Phone or email" });
      renderRows();
    });
    el.appendChild(add);
    return el;
  }

  function buildLogEl(log) {
    var el = document.createElement("div");
    el.className = "guide-log";
    el.dataset.id = log.id;
    el.innerHTML =
      '<div class="log-head">📓 <span contenteditable="true" class="log-title">' + esc(log.title) + "</span>" +
      '<button class="contact-del" type="button" style="margin-left:auto" title="Remove log">✕</button></div>';
    bindEditable(el.querySelector(".log-title"), function (v) { log.title = v; });
    el.querySelector(".log-head .contact-del").addEventListener("click", function () {
      state.guide.logs = state.guide.logs.filter(function (l) { return l.id !== log.id; });
      el.remove();
    });

    var table = document.createElement("table");
    table.className = "log-table";
    table.innerHTML = "<thead><tr><th>Date / time</th><th>Note</th><th></th></tr></thead>";
    var tbody = document.createElement("tbody");
    table.appendChild(tbody);

    function renderRows() {
      tbody.innerHTML = "";
      log.rows.forEach(function (r) {
        var tr = document.createElement("tr");
        tr.innerHTML =
          '<td contenteditable="true">' + esc(r.when) + "</td>" +
          '<td contenteditable="true">' + esc(r.note) + "</td>" +
          '<td><button class="contact-del" type="button">✕</button></td>';
        bindEditable(tr.children[0], function (v) { r.when = v; });
        bindEditable(tr.children[1], function (v) { r.note = v; });
        tr.querySelector(".contact-del").addEventListener("click", function () {
          log.rows = log.rows.filter(function (x) { return x.id !== r.id; });
          renderRows();
        });
        tbody.appendChild(tr);
      });
    }
    renderRows();
    el.appendChild(table);

    var add = document.createElement("button");
    add.className = "tool-btn";
    add.type = "button";
    add.textContent = "＋ Add row";
    add.style.marginTop = "12px";
    add.addEventListener("click", function () {
      log.rows.push({ id: uid(), when: "", note: "" });
      renderRows();
    });
    el.appendChild(add);
    return el;
  }

  /* ---------- Add section / log buttons ---------- */
  function addSection() {
    var sec = { id: uid(), icon: "📄", title: "New section", body: "Tap to add details…", photo: null, videoId: null };
    state.guide.sections.push(sec);
    var el = buildSectionEl(sec, true);
    // insert before emergency block
    var emg = $("guideDoc").querySelector(".guide-emergency");
    $("guideDoc").insertBefore(el, emg);
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function addLog() {
    var log = { id: uid(), title: "Log", rows: [{ id: uid(), when: "", note: "" }] };
    state.guide.logs.push(log);
    var el = buildLogEl(log);
    $("guideDoc").appendChild(el);
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* ---------- Editable binding ---------- */
  function bindEditable(node, onChange) {
    if (!node) return;
    node.addEventListener("blur", function () { onChange(node.innerText.trim()); });
    node.addEventListener("keydown", function (e) {
      // single-line fields (titles/contacts) shouldn't insert newlines
      if (e.key === "Enter" && !node.classList.contains("acc-content")) {
        e.preventDefault();
        node.blur();
      }
    });
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* ---------- YouTube parsing ---------- */
  function parseYouTube(url) {
    if (!url) return null;
    var m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
    if (m) return m[1];
    if (/^[\w-]{11}$/.test(url)) return url;
    return null;
  }

  /* ---------- Step 4: publish & share ---------- */
  function publish() {
    var g = state.guide;
    saveGuide(g);
    var url = guideUrl(g.slug);

    $("shareEmoji").textContent = g.emoji;
    $("shareTitle").textContent = g.title;
    $("shareUrl").value = url;
    $("openGuide").href = url;

    // QR code
    var box = $("qrBox");
    box.innerHTML = "";
    if (window.QRCode) {
      new QRCode(box, { text: url, width: 200, height: 200, colorDark: "#1A1A1A", colorLight: "#FFFFFF" });
    } else {
      box.innerHTML = '<p style="font-size:.85rem;color:var(--ink-muted)">QR unavailable offline</p>';
    }
    showStep(4);
  }

  function guideUrl(slug) {
    var base = location.href.replace(/builder\.html.*$/, "");
    return base + "guide.html?g=" + encodeURIComponent(slug);
  }

  function copyLink() {
    var input = $("shareUrl");
    var ok = function () { showToast("Link copied!"); };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(input.value).then(ok, function () { legacyCopy(input, ok); });
    } else { legacyCopy(input, ok); }
  }
  function legacyCopy(input, ok) {
    input.select(); input.setSelectionRange(0, 99999);
    try { document.execCommand("copy"); ok(); } catch (e) { showToast("Press ⌘/Ctrl+C to copy"); }
  }
  function downloadQR() {
    var box = $("qrBox");
    var canvas = box.querySelector("canvas");
    var img = box.querySelector("img");
    var dataUrl = canvas ? canvas.toDataURL("image/png") : (img ? img.src : null);
    if (!dataUrl) { showToast("QR not ready yet."); return; }
    var a = document.createElement("a");
    a.href = dataUrl;
    a.download = "how2-" + state.guide.slug + "-qr.png";
    a.click();
  }

  /* ---------- Wire up ---------- */
  renderCategories();
  $("qNext").addEventListener("click", nextQuestion);
  $("qBack").addEventListener("click", prevQuestion);
  $("previewBack").addEventListener("click", function () {
    state.qIndex = state.category.questions.length - 1;
    renderQuestion();
    showStep(2);
  });
  $("addSection").addEventListener("click", addSection);
  $("addLog").addEventListener("click", addLog);
  $("publishBtn").addEventListener("click", publish);
  $("editAgain").addEventListener("click", function () { showStep(3); });
  $("copyBtn").addEventListener("click", copyLink);
  $("downloadQr").addEventListener("click", downloadQR);

  showStep(1);
})();
