/* ============================================================
   How2 — Guide builder
   Wizard: category → questions → preview/edit → share
   Persists guides to localStorage (no backend for MVP).
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Id helpers (persistence lives in js/store.js) ---------- */
  function makeSlug() {
    var words = ["sunny", "cosy", "happy", "swift", "calm", "bright", "lucky", "warm"];
    var w = words[Math.floor(Math.random() * words.length)];
    return w + "-" + Math.random().toString(36).slice(2, 8);
  }
  function makeToken() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 14);
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
    guide: null,
    editToken: null,
    created: false
  };
  var importFile = null; // file chosen in the "build from notes/file" panel

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
    stopMic();
    wrap.innerHTML = "";

    var container = document.createElement("div");
    container.className = "field-with-mic";

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
    container.appendChild(field);
    attachMic(container, field, q.type === "textarea");
    wrap.appendChild(container);

    // Polish action for this answer
    var actions = document.createElement("div");
    actions.className = "field-actions";
    var polishBtn = document.createElement("button");
    polishBtn.type = "button";
    polishBtn.className = "tool-btn";
    polishBtn.textContent = "✨ Polish";
    polishBtn.addEventListener("click", function () {
      polishInto(function () { return field.value; },
        function (v) { field.value = v; }, polishBtn, aiCtx(fillName(q.q)));
    });
    actions.appendChild(polishBtn);
    wrap.appendChild(actions);

    setTimeout(function () { field.focus(); }, 50);

    // Enter advances on single-line inputs
    field.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && q.type !== "textarea") { e.preventDefault(); nextQuestion(); }
    });

    // On the first question, Back returns to the landing page; otherwise it
    // steps to the previous question.
    $("qBack").textContent = i === 0 ? "← Home" : "← Back";
    $("qNext").textContent = i === qs.length - 1 ? "Build my guide →" : "Next →";

    // First question of every category offers a shortcut: paste notes / upload a
    // file and let the AI build the whole guide instead of answering questions.
    var oldPanel = document.getElementById("importPanel");
    if (oldPanel) oldPanel.remove();
    if (i === 0) {
      var card = document.querySelector("#step2 .q-card");
      card.parentNode.insertBefore(buildImportPanel(), card);
    }
  }

  /* ---------- Build instantly from notes / a file ---------- */
  function buildImportPanel() {
    importFile = null;
    var panel = document.createElement("div");
    panel.id = "importPanel";
    panel.className = "import-panel";
    panel.innerHTML =
      '<button class="import-toggle" type="button">⚡ Already written it down? Build instantly from notes or a file</button>' +
      '<div class="import-body" hidden>' +
        '<p class="import-lead">Paste your notes, or add a PDF, photo, or text file — our AI turns it into a guide you can edit.</p>' +
        '<textarea class="q-textarea import-text" placeholder="Paste everything you already have here…"></textarea>' +
        '<div class="import-file-row">' +
          '<label class="tool-btn import-file-btn">📎 Add a file' +
            '<input type="file" accept=".pdf,.txt,.md,.csv,text/plain,image/*" hidden /></label>' +
          '<span class="import-file-name"></span>' +
        '</div>' +
        '<button class="btn btn-primary import-go" type="button">✨ Build my guide</button>' +
      "</div>";

    var toggle = panel.querySelector(".import-toggle");
    var body = panel.querySelector(".import-body");
    toggle.addEventListener("click", function () {
      var willOpen = body.hasAttribute("hidden");
      if (willOpen) body.removeAttribute("hidden"); else body.setAttribute("hidden", "");
      toggle.classList.toggle("open", willOpen);
    });

    var fileInput = panel.querySelector('input[type="file"]');
    var fileName = panel.querySelector(".import-file-name");
    fileInput.addEventListener("change", function () {
      importFile = fileInput.files[0] || null;
      fileName.textContent = importFile ? importFile.name : "";
    });

    panel.querySelector(".import-go").addEventListener("click", function () {
      runImport(panel.querySelector(".import-text").value.trim(), importFile);
    });
    return panel;
  }

  function runImport(rawText, file) {
    if (!rawText && !file) { showToast("Paste some notes or add a file first."); return; }
    steps.building.querySelector(".building-title").textContent = "Reading your notes…";
    steps.building.querySelector(".building-sub").textContent = "Turning what you have into a guide.";
    showStep("building");

    getFilePayload(file).then(function (fp) {
      if (fp && fp.error) { showToast(fp.error); showStep(2); return; }
      var mergedText = rawText || "";
      if (fp && fp.text) mergedText = (mergedText ? mergedText + "\n\n" : "") + fp.text;

      return How2Store.ai("import", {
        text: mergedText,
        category: state.category.name,
        fileData: fp && fp.data,
        fileType: fp && fp.type
      }).then(function (res) {
        if (res && res.sections && res.sections.length) {
          buildGuideFromAI(res, state.category, mergedText);
          renderGuideEditor();
          showStep(3);
          showToast("Built from your notes ✨");
        } else {
          importFallback(mergedText, !res); // null = no cloud backend
        }
      });
    }).catch(function () {
      importFallback(rawText || "", false);
    });
  }

  // Reads an uploaded file into something the AI can use:
  //   images → compressed base64; PDFs → base64; text files → plain text.
  function getFilePayload(file) {
    if (!file) return Promise.resolve(null);
    var type = file.type || "";
    var isImage = type.indexOf("image/") === 0;
    var isPdf = type === "application/pdf" || /\.pdf$/i.test(file.name);
    var isText = type.indexOf("text/") === 0 || /\.(txt|md|csv)$/i.test(file.name);

    if (isImage) {
      return compressImage(file, 1600, 0.8).then(function (dataUrl) {
        return { data: dataUrl.split(",")[1], type: "image/jpeg" };
      });
    }
    if (isPdf) {
      if (file.size > 4.5 * 1024 * 1024) {
        return Promise.resolve({ error: "That PDF is too large (max ~4MB). Try a smaller file or paste the text." });
      }
      return readAsBase64(file).then(function (b64) { return { data: b64, type: "application/pdf" }; });
    }
    if (isText) {
      return file.text().then(function (t) { return { text: t.slice(0, 8000) }; });
    }
    return Promise.resolve({ error: "Unsupported file — use a PDF, image, or text file." });
  }

  function readAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(",")[1]); };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  // Maps the AI's import result (or a fallback) into a fresh editable guide.
  function buildGuideFromAI(ai, cat, rawText) {
    var sections = (ai.sections || []).map(function (s) {
      return {
        id: uid(), icon: s.emoji || "📄", title: s.title || "Section",
        body: (s.body || "").trim() || "Tap to add details…", photo: null, videoId: null
      };
    });
    if (!sections.length) {
      sections.push({ id: uid(), icon: "📝", title: "My notes", body: rawText || "Tap to add details…", photo: null, videoId: null });
    }
    var contacts = (ai.contacts || [])
      .filter(function (c) { return c && (c.label || c.value); })
      .map(function (c) { return { id: uid(), label: c.label || "Contact", value: c.value || "" }; });

    state.guide = {
      slug: makeSlug(),
      category: cat.id,
      emoji: cat.emoji,
      title: (ai.title || "").trim() || ("My " + cat.name + " Guide"),
      subtitle: cat.coverSub,
      cover: null,
      sections: sections,
      contacts: contacts,
      logs: [],
      blockOrder: sections.map(function (s) { return "s:" + s.id; }).concat(["e"]),
      branding: true,
      createdAt: Date.now()
    };
    state.created = false;
  }

  function importFallback(rawText, noCloud) {
    buildGuideFromAI({
      title: "My " + state.category.name + " Guide",
      sections: [{ emoji: "📝", title: "My notes", body: rawText || "Tap to add details…" }],
      contacts: []
    }, state.category, rawText);
    renderGuideEditor();
    showStep(3);
    showToast(noCloud
      ? "Saved your notes — shape them into a guide below."
      : "AI couldn't process that — added your notes to edit.");
  }

  function fillName(str) {
    var nameAns = "";
    state.category.questions.forEach(function (q) {
      if (q.target === "title" && state.answers[q.id]) nameAns = state.answers[q.id];
    });
    return str.replace(/\{name\}/g, nameAns || "them");
  }

  function captureAnswer() {
    stopMic();
    var q = state.category.questions[state.qIndex];
    var field = $("qField");
    if (field) state.answers[q.id] = field.value.trim();
  }

  /* ---------- Voice dictation (Web Speech API) ---------- */
  var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var micRec = null; // the currently-running recognition, if any

  // Modern line-style microphone (inherits currentColor for hover/listening states).
  var MIC_SVG =
    '<svg class="mic-ico" viewBox="0 0 24 24" width="19" height="19" fill="none" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="9" y="2.5" width="6" height="11" rx="3"/>' +
    '<path d="M5.5 11a6.5 6.5 0 0 0 13 0"/>' +
    '<line x1="12" y1="17.5" x2="12" y2="21"/>' +
    '<line x1="8.5" y1="21" x2="15.5" y2="21"/>' +
    "</svg>";

  function stopMic() {
    if (micRec) { try { micRec.stop(); } catch (e) {} micRec = null; }
  }

  // Adds a mic button to `container` that dictates into `field`.
  // Silently does nothing if the browser has no speech recognition.
  function attachMic(container, field, isArea) {
    if (!SpeechRec) return;

    field.classList.add("has-mic");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mic-btn" + (isArea ? " mic-btn--area" : "");
    btn.setAttribute("aria-label", "Dictate your answer");
    btn.title = "Tap to dictate";
    btn.innerHTML = MIC_SVG;
    container.appendChild(btn);

    btn.addEventListener("click", function () {
      // Tapping while listening stops it.
      if (micRec) { stopMic(); return; }

      var rec = new SpeechRec();
      rec.lang = document.documentElement.lang || navigator.language || "en-US";
      rec.interimResults = true;
      rec.continuous = true;

      // Append dictation after any text already in the field.
      var base = field.value ? field.value.replace(/\s+$/, "") + " " : "";
      var finalText = "";

      rec.onstart = function () {
        btn.classList.add("listening");
        btn.title = "Listening… tap to stop";
        field.focus();
      };
      rec.onresult = function (e) {
        var interim = "";
        for (var i = e.resultIndex; i < e.results.length; i++) {
          var r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else interim += r[0].transcript;
        }
        field.value = base + finalText + interim;
      };
      rec.onerror = function (e) {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          showToast("Microphone access was blocked.");
        } else if (e.error === "no-speech") {
          showToast("Didn't catch that — try again.");
        }
      };
      rec.onend = function () {
        btn.classList.remove("listening");
        btn.title = "Tap to dictate";
        if (micRec === rec) micRec = null;
      };

      micRec = rec;
      try { rec.start(); }
      catch (err) { micRec = null; showToast("Couldn't start the microphone."); }
    });
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

  /* ---------- AI Polish (keyless — runs through the How2 backend) ---------- */

  // Built-in cleanup — no AI, no cost, works offline. Used as a fallback.
  function localPolish(text) {
    var lines = String(text).replace(/\r/g, "").split("\n");
    lines = lines.map(function (line) {
      var s = line.replace(/[ \t]+/g, " ").trim();
      if (!s) return "";
      s = s.replace(/([.!?,;:])(?=[A-Za-z])/g, "$1 "); // space after punctuation
      s = s.replace(/\bi\b/g, "I"); // standalone i
      s = s.replace(/^(\s*[-*•\d.]*\s*)?([a-z])/, function (m, pre, ch) {
        return (pre || "") + ch.toUpperCase(); // capitalize first letter
      });
      s = s.replace(/([.!?]\s+)([a-z])/g, function (m, p, ch) {
        return p + ch.toUpperCase(); // capitalize after sentence enders
      });
      return s;
    });
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  // Keyless cloud AI (knows the category + question for context) → local tidy-up.
  function polish(text, ctx) {
    ctx = ctx || {};
    function fallback() { showToast("Tidied up ✨"); return localPolish(text); }
    return How2Store.ai("polish", {
      text: text, category: ctx.category, question: ctx.question
    }).then(function (res) {
      if (res && typeof res.text === "string" && res.text.trim()) {
        showToast("Polished with AI ✨");
        return res.text;
      }
      return fallback(); // no cloud backend
    }, fallback);        // cloud errored
  }

  // Wires a Polish button to read/replace a piece of text with a loading state.
  // `ctx` ({ category, question }) gives the AI context about what it's editing.
  function polishInto(getText, setText, btn, ctx) {
    var text = (getText() || "").trim();
    if (!text || text === "Tap to add details…") { showToast("Nothing to polish yet."); return; }
    var orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = "✨ Polishing…";
    polish(text, ctx).then(function (out) {
      setText(out);
    }).then(null, function () {}).then(function () {
      btn.disabled = false;
      btn.textContent = orig;
    });
  }

  // Builds AI context for a field. `state.category` is set during the wizard;
  // when editing an existing guide we look the name up from its category id.
  function aiCtx(question) {
    var name = (state.category && state.category.name) ||
      (state.guide && catName(state.guide.category)) || "a how-to guide";
    return { category: name, question: question || "" };
  }
  function catName(id) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i].name;
    return "a how-to guide";
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
      cover: null,
      sections: sections,
      contacts: contacts,
      logs: [],
      blockOrder: sections.map(function (s) { return "s:" + s.id; }).concat(["e"]),
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
      '<div class="cover-sub" contenteditable="true" data-bind="subtitle">' + esc(g.subtitle) + "</div>" +
      '<div class="cover-tools">' +
        '<button class="cover-btn" data-act="cover-photo" type="button">📸 Cover photo</button>' +
        '<button class="cover-btn" data-act="cover-remove" type="button" hidden>Remove photo</button>' +
      "</div>";
    bindEditable(cover.querySelector('[data-bind="title"]'), function (v) { g.title = v; });
    bindEditable(cover.querySelector('[data-bind="subtitle"]'), function (v) { g.subtitle = v; });
    applyCover(cover, g);
    cover.querySelector('[data-act="cover-photo"]').addEventListener("click", function () { pickCover(cover); });
    cover.querySelector('[data-act="cover-remove"]').addEventListener("click", function () {
      g.cover = null; applyCover(cover, g);
    });
    doc.appendChild(cover);

    // Render blocks (sections / emergency / logs) in the saved order
    if (!g.blockOrder || !g.blockOrder.length) {
      g.blockOrder = g.sections.map(function (s) { return "s:" + s.id; })
        .concat(["e"]).concat(g.logs.map(function (l) { return "l:" + l.id; }));
    }
    if (g.blockOrder.indexOf("e") === -1) g.blockOrder.push("e");

    var rendered = {};
    var firstSection = true;
    g.blockOrder.forEach(function (tok) {
      if (tok === "e") {
        doc.appendChild(buildEmergencyEl());
        rendered.e = true;
      } else if (tok.indexOf("s:") === 0) {
        var sec = findSection(tok.slice(2));
        if (sec) { doc.appendChild(buildSectionEl(sec, firstSection)); firstSection = false; rendered[tok] = true; }
      } else if (tok.indexOf("l:") === 0) {
        var log = findLog(tok.slice(2));
        if (log) { doc.appendChild(buildLogEl(log)); rendered[tok] = true; }
      }
    });
    // Reconcile anything missing from blockOrder (e.g. legacy guides)
    if (!rendered.e) doc.appendChild(buildEmergencyEl());
    g.sections.forEach(function (sec) {
      if (!rendered["s:" + sec.id]) { doc.appendChild(buildSectionEl(sec, firstSection)); firstSection = false; }
    });
    g.logs.forEach(function (log) {
      if (!rendered["l:" + log.id]) doc.appendChild(buildLogEl(log));
    });
    syncBlockOrder();
  }

  function findSection(id) {
    return state.guide.sections.filter(function (s) { return s.id === id; })[0];
  }
  function findLog(id) {
    return state.guide.logs.filter(function (l) { return l.id === id; })[0];
  }

  // Paints the cover photo (with a dark overlay for legible text) or clears it.
  function applyCover(coverEl, g) {
    var removeBtn = coverEl.querySelector('[data-act="cover-remove"]');
    if (g.cover) {
      coverEl.classList.add("has-cover");
      coverEl.style.backgroundImage =
        "linear-gradient(180deg, rgba(26,26,26,0.28), rgba(26,26,26,0.55)), url(" + g.cover + ")";
      if (removeBtn) removeBtn.hidden = false;
    } else {
      coverEl.classList.remove("has-cover");
      coverEl.style.backgroundImage = "";
      if (removeBtn) removeBtn.hidden = true;
    }
  }

  // Downscale + re-encode an image file to keep guides small enough to store.
  function compressImage(file, maxDim, quality) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          var cw = Math.round(img.width * scale);
          var ch = Math.round(img.height * scale);
          var canvas = document.createElement("canvas");
          canvas.width = cw; canvas.height = ch;
          canvas.getContext("2d").drawImage(img, 0, 0, cw, ch);
          try { resolve(canvas.toDataURL("image/jpeg", quality)); }
          catch (e) { resolve(reader.result); }
        };
        img.onerror = function () { resolve(reader.result); };
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function pickCover(coverEl) {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", function () {
      var file = input.files[0];
      if (!file) return;
      compressImage(file, 1400, 0.78).then(function (dataUrl) {
        state.guide.cover = dataUrl;
        applyCover(coverEl, state.guide);
      });
    });
    input.click();
  }

  // Records the current DOM order of all blocks (sections / emergency / logs).
  var DRAG_SELECTOR = ".guide-section, .guide-emergency, .guide-log";
  function syncBlockOrder() {
    var order = [];
    Array.prototype.forEach.call($("guideDoc").children, function (el) {
      if (el.classList.contains("guide-section")) order.push("s:" + el.dataset.id);
      else if (el.classList.contains("guide-emergency")) order.push("e");
      else if (el.classList.contains("guide-log")) order.push("l:" + el.dataset.id);
    });
    state.guide.blockOrder = order;
  }

  // Drag-to-reorder via a grip handle. Pointer events → works on mouse + touch.
  // Works for any block: content sections, emergency contacts, and logs.
  function enableDrag(handle, blockEl) {
    if (!handle) return;
    handle.addEventListener("click", function (e) { e.stopPropagation(); });
    handle.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var doc = $("guideDoc");
      blockEl.classList.add("dragging");

      function onMove(ev) {
        var y = ev.clientY;
        var blocks = Array.prototype.slice.call(doc.querySelectorAll(DRAG_SELECTOR));
        var placed = false;
        for (var i = 0; i < blocks.length; i++) {
          var b = blocks[i];
          if (b === blockEl) continue;
          var r = b.getBoundingClientRect();
          if (y < r.top + r.height / 2) { doc.insertBefore(blockEl, b); placed = true; break; }
        }
        if (!placed) doc.appendChild(blockEl); // below everything
      }
      function onUp() {
        blockEl.classList.remove("dragging");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        syncBlockOrder();
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  }

  function buildSectionEl(sec, openFirst) {
    var el = document.createElement("div");
    el.className = "guide-section" + (openFirst ? " open" : "");
    el.dataset.id = sec.id;

    el.innerHTML =
      '<button class="acc-header" type="button">' +
        '<span class="drag-handle" title="Drag to reorder" aria-label="Drag to reorder">⠿</span>' +
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
          '<button class="tool-btn" data-act="polish" type="button">✨ Polish</button>' +
          '<button class="tool-btn" data-act="photo" type="button">📸 Photo</button>' +
          '<button class="tool-btn" data-act="video" type="button">🎬 Video</button>' +
          '<button class="tool-btn danger" data-act="remove" type="button">🗑 Remove</button>' +
        "</div>" +
      "</div></div>";

    // Accordion toggle (ignore clicks on the editable title)
    var header = el.querySelector(".acc-header");
    header.addEventListener("click", function (e) {
      if (e.target.classList.contains("acc-title-text") ||
          e.target.classList.contains("drag-handle")) return;
      el.classList.toggle("open");
    });
    enableDrag(el.querySelector(".drag-handle"), el);

    bindEditable(el.querySelector(".acc-title-text"), function (v) { sec.title = v; });
    bindEditable(el.querySelector(".acc-content"), function (v) { sec.body = v; });

    renderSectionMedia(el, sec);

    // Tools
    var tools = el.querySelector(".sec-tools");
    tools.querySelector('[data-act="remove"]').addEventListener("click", function () {
      state.guide.sections = state.guide.sections.filter(function (s) { return s.id !== sec.id; });
      el.remove();
      syncBlockOrder();
    });
    var photoBtn = tools.querySelector('[data-act="photo"]');
    photoBtn.addEventListener("click", function () { pickPhoto(sec, el); });

    var polishBtn = tools.querySelector('[data-act="polish"]');
    polishBtn.addEventListener("click", function () {
      var contentEl = el.querySelector(".acc-content");
      if (!el.classList.contains("open")) el.classList.add("open");
      polishInto(function () { return contentEl.innerText; },
        function (v) { contentEl.innerText = v; sec.body = v; }, polishBtn, aiCtx(sec.title));
    });

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
      compressImage(file, 1200, 0.72).then(function (dataUrl) {
        sec.photo = dataUrl;
        renderSectionMedia(el, sec);
        if (!el.classList.contains("open")) el.classList.add("open");
      });
    });
    input.click();
  }

  function buildEmergencyEl() {
    var g = state.guide;
    var el = document.createElement("div");
    el.className = "guide-emergency";
    el.innerHTML =
      '<div class="em-head">' +
        '<span class="drag-handle" title="Drag to reorder" aria-label="Drag to reorder">⠿</span>' +
        "<span>🚨 Emergency Contacts</span>" +
      "</div>";
    enableDrag(el.querySelector(".drag-handle"), el);
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
      '<div class="log-head">' +
        '<span class="drag-handle" title="Drag to reorder" aria-label="Drag to reorder">⠿</span>' +
        '📓 <span contenteditable="true" class="log-title">' + esc(log.title) + "</span>" +
        '<button class="contact-del" type="button" style="margin-left:auto" title="Remove log">✕</button>' +
      "</div>";
    enableDrag(el.querySelector(".drag-handle"), el);
    bindEditable(el.querySelector(".log-title"), function (v) { log.title = v; });
    el.querySelector(".log-head .contact-del").addEventListener("click", function () {
      state.guide.logs = state.guide.logs.filter(function (l) { return l.id !== log.id; });
      el.remove();
      syncBlockOrder();
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
    // insert before emergency block (or at the end if it isn't present)
    var emg = $("guideDoc").querySelector(".guide-emergency");
    if (emg) $("guideDoc").insertBefore(el, emg);
    else $("guideDoc").appendChild(el);
    syncBlockOrder();
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function addLog() {
    var log = { id: uid(), title: "Log", rows: [{ id: uid(), when: "", note: "" }] };
    state.guide.logs.push(log);
    var el = buildLogEl(log);
    $("guideDoc").appendChild(el);
    syncBlockOrder();
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

  /* ---------- Password lock controls (step 3) ---------- */
  function toggleLockUI() {
    var on = $("lockOn").checked;
    $("lockPass").hidden = !on;
    $("lockHint").hidden = !on;
    if (on) setTimeout(function () { $("lockPass").focus(); }, 50);
  }

  /* ---------- Step 4: publish & share ---------- */
  function publish() {
    var g = state.guide;
    if (!state.editToken) state.editToken = makeToken();

    var locked = $("lockOn").checked;
    var pass = locked ? ($("lockPass").value || "").trim() : "";
    if (locked && !pass) { showToast("Enter a password, or untick the lock."); return; }
    if (locked && !How2Store.canEncrypt()) {
      showToast("Password protection needs the live (https) site.");
      return;
    }

    var btn = $("publishBtn");
    btn.disabled = true;
    btn.textContent = "Publishing…";

    // Encrypt into a storage envelope when locked; otherwise store the guide as-is.
    var prep = (locked && pass) ? How2Store.encrypt(g, pass) : Promise.resolve(g);

    prep.then(function (payloadObj) {
      // Guard against guides whose images are too big for the database (Phase 1).
      if (JSON.stringify(payloadObj).length > 380000) throw new Error("__TOOBIG__");
      state.password = pass; // remember for re-publish in this session
      var op = state.created
        ? How2Store.update(payloadObj)
        : How2Store.create(payloadObj, state.editToken);
      return op;
    }).then(function (res) {
      state.created = true;
      showShare(g, res && res.cloud, locked);
    }).catch(function (err) {
      if (err && err.message === "__TOOBIG__") {
        showToast("This guide's images are too large to publish online yet — try removing one.");
      } else {
        showToast("Couldn't publish: " + (err.message || "try again"));
      }
    }).then(function () {
      btn.disabled = false;
      btn.textContent = "Publish & share →";
    });
  }

  function showShare(g, isCloud, locked) {
    var url = pageUrl("guide.html", "g=" + encodeURIComponent(g.slug));
    var editLink = pageUrl("builder.html", "g=" + encodeURIComponent(g.slug) + "&t=" + encodeURIComponent(state.editToken));

    $("shareEmoji").textContent = g.emoji;
    $("shareTitle").textContent = g.title;
    var sub = document.querySelector("#step4 .share-sub");
    if (sub) {
      sub.textContent = locked
        ? "🔒 Password-protected — only people with the password can read it."
        : "Anyone with this link can view it.";
    }
    $("shareUrl").value = url;
    $("editUrl").value = editLink;
    $("openGuide").href = url;

    // Share-to channels
    var msg = "Check out my How2 guide — " + g.title + ": " + url;
    $("shareWhatsapp").href = "https://wa.me/?text=" + encodeURIComponent(msg);
    $("shareSms").href = "sms:?&body=" + encodeURIComponent(msg);
    $("shareEmail").href = "mailto:?subject=" + encodeURIComponent(g.title + " — a How2 guide") +
      "&body=" + encodeURIComponent(msg);

    var nativeBtn = $("shareNative");
    if (navigator.share) {
      nativeBtn.hidden = false;
      nativeBtn.onclick = function () {
        navigator.share({ title: g.title, text: "Check out my How2 guide:", url: url })
          .catch(function () {});
      };
    } else {
      nativeBtn.hidden = true;
    }

    // QR code (of the view link)
    var box = $("qrBox");
    box.innerHTML = "";
    if (window.QRCode) {
      new QRCode(box, { text: url, width: 200, height: 200, colorDark: "#1A1A1A", colorLight: "#FFFFFF" });
    } else {
      box.innerHTML = '<p style="font-size:.85rem;color:var(--ink-muted)">QR unavailable offline</p>';
    }
    if (!isCloud) {
      showToast("Saved on this device. (Cloud sharing activates once the backend is live.)");
    }
    showStep(4);
  }

  // Builds an absolute URL to another page in the same folder.
  function pageUrl(page, qs) {
    var base = location.href.replace(/[^/]*(\?.*)?(#.*)?$/, "");
    return base + page + (qs ? "?" + qs : "");
  }

  function copyFrom(id, msg) {
    var input = $(id);
    var ok = function () { showToast(msg); };
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
  $("copyBtn").addEventListener("click", function () { copyFrom("shareUrl", "Link copied!"); });
  $("copyEditBtn").addEventListener("click", function () { copyFrom("editUrl", "Edit link copied!"); });
  $("downloadQr").addEventListener("click", downloadQR);
  $("lockOn").addEventListener("change", toggleLockUI);

  // Entry: an edit link (?g=slug&t=token) opens that guide; otherwise start fresh.
  function getParam(name) {
    var m = location.search.match(new RegExp("[?&]" + name + "=([^&]+)"));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function enterEditMode(slug, token) {
    steps.building.querySelector(".building-title").textContent = "Loading your guide…";
    showStep("building");
    How2Store.getForEdit(slug).then(function (rec) {
      if (!rec || !rec.guide) {
        showToast("Guide not found.");
        showStep(1);
        return;
      }
      if (rec.editToken && token !== rec.editToken) {
        // Not the owner — send to the read-only view instead.
        window.location.href = pageUrl("guide.html", "g=" + encodeURIComponent(slug));
        return;
      }
      if (How2Store.isEncrypted(rec.guide)) {
        var pass = window.prompt("This guide is password-protected. Enter its password to edit:");
        if (pass == null) { window.location.href = "index.html"; return; }
        How2Store.decrypt(rec.guide, pass).then(function (real) {
          state.password = pass;
          $("lockOn").checked = true;
          toggleLockUI();
          $("lockPass").value = pass;
          finishEnterEdit(real, rec.editToken || token);
        }, function () {
          showToast("Wrong password.");
          showStep(1);
        });
        return;
      }
      finishEnterEdit(rec.guide, rec.editToken || token);
    }).catch(function () {
      showToast("Couldn't load that guide.");
      showStep(1);
    });
  }
  function finishEnterEdit(guide, token) {
    state.guide = guide;
    state.editToken = token;
    state.created = true;
    renderGuideEditor();
    showStep(3);
  }

  var editSlug = getParam("g");
  var editToken = getParam("t");
  if (editSlug && editToken) enterEditMode(editSlug, editToken);
  else showStep(1);
})();
