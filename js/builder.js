/* ============================================================
   GotIt Guides — Guide builder
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
  // Normalise a user-chosen link name into a safe slug.
  function normalizeSlug(s) {
    return (s || "").toLowerCase().trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

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
        { id: "who", q: "Key people & contacts?", hint: "Who to ask for what.", ph: "Manager: …\nHR: …\nIT: …", type: "textarea", target: "emergency" },
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
        { id: "emergency", q: "Who to contact on the day?", hint: "Organiser or coordinator.", ph: "Coordinator: …\nVenue: …", type: "textarea", target: "emergency" }
      ]
    },
    {
      id: "cleaner", emoji: "🧹", name: "Cleaner", desc: "For your cleaner",
      coverSub: "Everything my cleaner needs to know",
      questions: [
        { id: "name", q: "What should we call this guide?", hint: "Usually the home or client name.", ph: "e.g. 12 Rose St", type: "text", target: "title" },
        { id: "access", q: "How does the cleaner get in?", hint: "Keys, lockbox, alarm code, parking.", ph: "Lockbox 1234 by the door. Alarm off: 5678…", type: "textarea", target: "section", icon: "🔑", sectionTitle: "Getting In & Parking" },
        { id: "tasks", q: "What needs cleaning each visit?", hint: "Room by room, and the priorities.", ph: "Kitchen: benches, floors…\nBathrooms: …\nFloors throughout…", type: "textarea", target: "section", icon: "✅", sectionTitle: "What to Clean" },
        { id: "products", q: "Where are the products & equipment?", hint: "What to use where — and what to avoid.", ph: "Vacuum in the hall closet. Use only the spray under the sink…", type: "textarea", target: "section", icon: "🧴", sectionTitle: "Products & Equipment" },
        { id: "prefs", q: "Any preferences or areas to skip?", hint: "Pets, fragile items, rooms to leave.", ph: "Please don't enter the study. Cat stays inside…", type: "textarea", target: "section", icon: "📋", sectionTitle: "Preferences & No-Go Areas" },
        { id: "emergency", q: "Who do they contact with questions?", hint: "You, plus a backup.", ph: "Me: 0400 000 000\nBackup: …", type: "textarea", target: "emergency" }
      ]
    },
    {
      id: "gardener", emoji: "🌳", name: "Gardener", desc: "For your gardener",
      coverSub: "Everything my gardener needs to know",
      questions: [
        { id: "name", q: "What should we call this guide?", hint: "The property or client name.", ph: "e.g. 12 Rose St", type: "text", target: "title" },
        { id: "access", q: "How does the gardener get in?", hint: "Gate codes, side access, where to park.", ph: "Side gate code 1234. Park in the driveway…", type: "textarea", target: "section", icon: "🔑", sectionTitle: "Access & Parking" },
        { id: "tasks", q: "What should be done each visit?", hint: "Mowing, edging, weeding, pruning.", ph: "Mow front & back, edge the paths, weed the beds…", type: "textarea", target: "section", icon: "✂️", sectionTitle: "What Needs Doing" },
        { id: "plants", q: "Any special plants or areas?", hint: "What to protect, prune or leave alone.", ph: "Don't prune the roses yet. The veggie patch is…", type: "textarea", target: "section", icon: "🌿", sectionTitle: "Plants & Areas to Know" },
        { id: "waste", q: "Watering, green waste & tools?", hint: "Watering schedule, which bin, where tools live.", ph: "Green bin out Wed. Hose on the side. Water the pots daily…", type: "textarea", target: "section", icon: "🗑️", sectionTitle: "Watering, Bins & Tools" },
        { id: "emergency", q: "Who do they contact with questions?", hint: "You, plus a backup.", ph: "Me: 0400 000 000", type: "textarea", target: "emergency" }
      ]
    },
    {
      id: "physio", emoji: "🧑‍⚕️", name: "Physio / Rehab", desc: "Exercise plan",
      coverSub: "Your home exercise plan",
      questions: [
        { id: "name", q: "What's this plan called?", hint: "Becomes the title.", ph: "e.g. Knee Rehab Plan", type: "text", target: "title" },
        { id: "overview", q: "What's it for, and the goals?", hint: "Brief background and what we're working towards.", ph: "Post-op left knee. Goal: full range of motion by 6 weeks…", type: "textarea", target: "section", icon: "📋", sectionTitle: "Condition & Goals" },
        { id: "exercises", q: "What are the exercises?", hint: "Sets, reps and how often — one per line.", ph: "Heel slides — 3×10, twice daily\nQuad sets — 3×10…", type: "textarea", target: "section", icon: "🏃", sectionTitle: "Your Exercises" },
        { id: "precautions", q: "Anything to avoid or watch for?", hint: "Pain limits, movements to skip.", ph: "Stop if you feel sharp pain. Avoid deep squats for now…", type: "textarea", target: "section", icon: "⚠️", sectionTitle: "Precautions & What to Avoid" },
        { id: "progress", q: "How should they track progress?", hint: "What to note each day.", ph: "Note pain level (0–10) and reps completed each session…", type: "textarea", target: "section", icon: "📈", sectionTitle: "Tracking Progress" },
        { id: "emergency", q: "Clinic contact & next appointment?", hint: "Where to call with questions.", ph: "Clinic: 0400 000 000\nNext appt: …", type: "textarea", target: "emergency" }
      ]
    },
    {
      id: "housesit", emoji: "🏡", name: "House Sitter", desc: "While you're away",
      coverSub: "Everything you need while I'm away",
      questions: [
        { id: "name", q: "What should we call this guide?", hint: "Usually the home name.", ph: "e.g. Our House", type: "text", target: "title" },
        { id: "access", q: "Getting in and the alarm?", hint: "Keys, alarm codes, locking up.", ph: "Key under the pot. Alarm code 1234…", type: "textarea", target: "section", icon: "🔑", sectionTitle: "Getting In & Security" },
        { id: "tasks", q: "What needs doing while you're away?", hint: "Bins, mail, plants, watering.", ph: "Bins: green out Wed.\nWater the pot plants every 2 days.\nBring in the mail…", type: "textarea", target: "section", icon: "✅", sectionTitle: "Daily & Weekly Tasks" },
        { id: "appliances", q: "Any appliances or quirks to know?", hint: "Heating, that tricky lock, hot water.", ph: "Heating timer is in the hall. The back door sticks…", type: "textarea", target: "section", icon: "🛠️", sectionTitle: "Appliances & Quirks" },
        { id: "problems", q: "What to do if something breaks?", hint: "Water main, fuse box, who to call.", ph: "Water shutoff is under the sink. Fuse box in the garage…", type: "textarea", target: "section", icon: "🚧", sectionTitle: "If Something Goes Wrong" },
        { id: "emergency", q: "Emergency contacts?", hint: "You, a neighbour, a tradie.", ph: "Me: …\nNeighbour: …\nPlumber: …", type: "textarea", target: "emergency" }
      ]
    },
    {
      id: "care", emoji: "👵", name: "Aged / Home Care", desc: "Carer-ready",
      coverSub: "Everything the carer needs to know",
      questions: [
        { id: "name", q: "Whose care guide is this?", hint: "Their name.", ph: "e.g. Mum (Joan)", type: "text", target: "title", titleSuffix: "'s Care Guide" },
        { id: "routine", q: "What's the daily routine?", hint: "Waking, meals, rest, mobility needs.", ph: "Up at 7. Needs a hand on the stairs. Rests after lunch…", type: "textarea", target: "section", icon: "🕐", sectionTitle: "Daily Routine & Mobility" },
        { id: "meds", q: "Medications & health needs?", hint: "What, when, where it's kept, conditions.", ph: "Morning tablets with breakfast. Inhaler in the drawer…", type: "textarea", target: "section", icon: "💊", sectionTitle: "Medications & Health" },
        { id: "meals", q: "Meals & dietary needs?", hint: "What they eat, help needed, what to avoid.", ph: "Soft foods. Tea at 3. Allergic to shellfish…", type: "textarea", target: "section", icon: "🍽️", sectionTitle: "Meals & Dietary" },
        { id: "emergency", q: "Important contacts?", hint: "GP, family, after-hours.", ph: "GP: …\nDaughter: …\nAfter-hours nurse: …", type: "textarea", target: "emergency" },
        { id: "extra", q: "Anything else that helps?", hint: "Routines that comfort, things to avoid.", ph: "Enjoys the radio in the morning. Doesn't like surprises…", type: "textarea", target: "section", icon: "💡", sectionTitle: "Good to Know" }
      ]
    },
    {
      id: "other", emoji: "✏️", name: "Other", desc: "Custom guide",
      coverSub: "A GotIt Guides guide",
      questions: [
        { id: "name", q: "What's your guide about?", hint: "This becomes the title.", ph: "e.g. How to use the espresso machine", type: "text", target: "title" },
        { id: "intro", q: "Give a short intro.", hint: "What is this and who's it for?", ph: "A quick guide to…", type: "textarea", target: "section", icon: "📖", sectionTitle: "Overview" },
        { id: "steps", q: "What are the main steps or sections?", hint: "One per line is fine.", ph: "Step 1…\nStep 2…", type: "textarea", target: "section", icon: "✅", sectionTitle: "Steps" },
        { id: "tips", q: "Any tips or things to watch out for?", hint: "", ph: "Don't forget to…", type: "textarea", target: "section", icon: "💡", sectionTitle: "Tips" },
        { id: "contact", q: "Who can help if stuck?", hint: "Optional.", ph: "Name — phone / email", type: "textarea", target: "emergency" }
      ]
    }
  ];

  /* ---------- App state ---------- */
  var state = {
    category: null,
    qIndex: 0,
    answers: {},
    media: {},      // per-question photo / videoEmbed, keyed by question id
    guide: null,
    editToken: null,
    created: false
  };
  var importFiles = []; // photos / files chosen in the "paste existing notes" panel
  var autoPasteIntent = false; // set when arriving via ?start=paste — auto-opens the import panel

  /* ---------- DOM refs ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var steps = {
    1: $("step1"), start: $("stepStart"), 2: $("step2"), building: $("stepBuilding"),
    3: $("step3"), 4: $("step4")
  };
  var toast = $("toast");
  var currentStepKey = 1;

  /* ---------- Undo / redo (step 3 editing) ----------
     Snapshots the whole guide on each change (debounced for typing). */
  var history = [], hIndex = -1, histTimer = null, histBusy = false;
  var MAX_HISTORY = 40;
  // Currently selected block, for the floating dock's widget actions.
  var selectedEl = null, selectedType = null, selectedRef = null;
  function snapshot() { return JSON.stringify(state.guide); }
  function recordHistory() {
    if (histBusy || !state.guide) return;
    var s = snapshot();
    if (history[hIndex] === s) return;
    history = history.slice(0, hIndex + 1);
    history.push(s);
    if (history.length > MAX_HISTORY) history.shift();
    hIndex = history.length - 1;
    updateUndoRedo();
  }
  function scheduleHistory() {
    if (histBusy) return;
    clearTimeout(histTimer);
    histTimer = setTimeout(recordHistory, 300);
  }
  function flushHistory() { clearTimeout(histTimer); recordHistory(); }
  function initHistory() { history = [snapshot()]; hIndex = 0; updateUndoRedo(); }
  function restoreHistory() {
    histBusy = true;
    state.guide = JSON.parse(history[hIndex]);
    renderGuideEditor();
    updateUndoRedo();
    histBusy = false;
  }
  function undo() { flushHistory(); if (hIndex > 0) { hIndex--; restoreHistory(); } }
  function redo() { if (hIndex < history.length - 1) { hIndex++; restoreHistory(); } }
  function updateUndoRedo() {
    var u = $("undoFab"), r = $("redoFab");
    if (u) u.disabled = hIndex <= 0;
    if (r) r.disabled = hIndex >= history.length - 1;
  }

  function showStep(key) {
    currentStepKey = key;
    Object.keys(steps).forEach(function (k) { steps[k].classList.remove("active"); });
    steps[key].classList.add("active");
    // The editor dock (and its feedback button) only show on the edit step;
    // the standalone feedback FAB covers the other steps.
    var dock = $("editDock");
    if (dock) dock.hidden = (key !== 3);
    var fb = $("feedbackFab");
    if (fb) fb.hidden = (key === 3);
    if (key !== 3) closeDockPop();
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

  /* ---------- Feedback (floating, available on every step) ---------- */
  var STEP_LABELS = { 1: "category", 2: "questions", building: "building", 3: "editor", 4: "share" };
  var FEEDBACK_LEAD_DEFAULT = "What's working, what's confusing, what's missing? It goes straight to the team.";
  var feedbackImage = null; // { data: base64, type } screenshot attached to feedback
  function clearFeedbackImage() {
    feedbackImage = null;
    if ($("feedbackImg")) $("feedbackImg").value = "";
    if ($("feedbackImgPreview")) $("feedbackImgPreview").hidden = true;
  }
  function openFeedback(lead) {
    $("feedbackLead").textContent = (typeof lead === "string" && lead) ? lead : FEEDBACK_LEAD_DEFAULT;
    $("feedbackNote").hidden = true;
    clearFeedbackImage();
    $("feedbackModal").hidden = false;
    setTimeout(function () { $("feedbackText").focus(); }, 50);
  }
  function closeFeedback() { $("feedbackModal").hidden = true; }
  function sendFeedback() {
    var text = ($("feedbackText").value || "").trim();
    var note = $("feedbackNote");
    if (text.length < 3) {
      note.textContent = "Please add a little detail first.";
      note.className = "feedback-note error";
      note.hidden = false;
      return;
    }
    var btn = $("feedbackSend");
    btn.disabled = true; btn.textContent = "Sending…";
    var context = "step:" + (STEP_LABELS[currentStepKey] || currentStepKey) +
      " · category:" + ((state.category && state.category.id) || (state.guide && state.guide.category) || "-") +
      " · " + location.href;
    GotItStore.feedback({
      message: text, email: ($("feedbackEmail").value || "").trim(), context: context,
      image: feedbackImage && feedbackImage.data, imageType: feedbackImage && feedbackImage.type
    })
      .then(function () {
        note.textContent = "Thanks — got it! 🙌";
        note.className = "feedback-note ok";
        note.hidden = false;
        $("feedbackText").value = "";
        $("feedbackEmail").value = "";
        clearFeedbackImage();
        setTimeout(closeFeedback, 1100);
      })
      .catch(function () {
        note.textContent = "Couldn't send just now — please try again.";
        note.className = "feedback-note error";
        note.hidden = false;
      })
      .then(function () { btn.disabled = false; btn.textContent = "Send feedback"; });
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
    state.media = {};
    showStart();
  }

  /* ---------- Step 1b: paste existing notes vs start from scratch ---------- */
  function showStart() {
    // Reset the paste panel each time we land here.
    importFiles = [];
    renderPasteAttach();
    var panel = $("pastePanel");
    if (panel) panel.setAttribute("hidden", "");
    $("startPaste").classList.remove("active");
    $("startScratch").classList.remove("active");
    $("pasteText").value = "";
    if ($("pasteFile")) $("pasteFile").value = "";
    if ($("pastePhoto")) $("pastePhoto").value = "";
    $("startHeading").textContent = "How would you like to start your " + state.category.name + " guide?";
    showStep("start");
    // Arrived from a homepage "Paste your notes" CTA — open the paste path.
    if (autoPasteIntent) {
      autoPasteIntent = false;
      revealPaste();
    }
  }

  function revealPaste() {
    $("startPaste").classList.add("active");
    $("startScratch").classList.remove("active");
    $("pastePanel").removeAttribute("hidden");
    setTimeout(function () {
      var ta = $("pasteText");
      ta.focus();
      ta.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 60);
  }

  function startFromScratch() {
    state.qIndex = 0;
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

    // Per-field actions: add a file (AI reads it in) + polish
    var actions = document.createElement("div");
    actions.className = "field-actions";

    // File reads its content into this answer (AI). On section steps this is
    // grouped with Photo/Video in one "Add" menu; elsewhere it's a lone button.
    var fileItem = { label: "📎 File", onClick: function (trigger) {
      readFileIntoField({
        btn: trigger, question: fillName(q.q),
        get: function () { return field.value; },
        set: function (v) { field.value = v; }
      });
    } };
    if (q.target === "section") {
      actions.appendChild(makeAddMenu([
        fileItem,
        { label: "📷 Photo", onClick: function () { pickStepPhoto(q.id); } },
        { label: "🎬 Video", onClick: function () {
          openVideoModal(function (embed) {
            (state.media[q.id] = state.media[q.id] || {}).videoEmbed = embed;
            renderStepMedia(q.id);
          });
        } }
      ]));
    } else {
      var fileBtn = document.createElement("button");
      fileBtn.type = "button";
      fileBtn.className = "tool-btn";
      fileBtn.textContent = "📎 Add a file";
      fileBtn.addEventListener("click", function () { fileItem.onClick(fileBtn); });
      actions.appendChild(fileBtn);
    }

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

    // Media preview for this step
    if (q.target === "section") {
      var mediaWrap = document.createElement("div");
      mediaWrap.className = "q-media";
      mediaWrap.id = "qMedia";
      wrap.appendChild(mediaWrap);
      renderStepMedia(q.id);
    }

    setTimeout(function () { field.focus(); }, 50);

    // Enter advances on single-line inputs
    field.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && q.type !== "textarea") { e.preventDefault(); nextQuestion(); }
    });

    // Back returns to the previous question, or to the start chooser on the first.
    $("qBack").textContent = "← Back";
    $("qNext").textContent = i === qs.length - 1 ? "Build my guide →" : "Next →";

  }

  /* ---------- Build instantly from pasted notes / photos / files ---------- */
  function runImport(rawText, files) {
    files = files || [];
    if (!rawText && !files.length) { showToast("Paste some notes or add a photo or file first."); return; }
    steps.building.querySelector(".building-title").textContent = "Reading your notes…";
    steps.building.querySelector(".building-sub").textContent = files.length > 1
      ? "Reading your photos and turning them into a guide."
      : "Turning what you have into a guide.";
    showStep("building");

    getFilePayloads(files).then(function (agg) {
      if (agg.error) { showToast(agg.error); showStep("start"); return; }
      var mergedText = rawText || "";
      if (agg.text) mergedText = (mergedText ? mergedText + "\n\n" : "") + agg.text;

      return GotItStore.ai("import", {
        text: mergedText,
        category: state.category.name,
        fileDatas: agg.fileDatas,
        fileTypes: agg.fileTypes
      }).then(function (res) {
        if (res && res.sections && res.sections.length) {
          buildGuideFromAI(res, state.category, mergedText);
          renderGuideEditor();
          showStep(3);
          initHistory();
          showToast(files.length > 1 ? "Built from your notes and photos ✨" : "Built from your notes ✨");
        } else {
          importFallback(mergedText, !res); // null = no cloud backend
        }
      });
    }).catch(function () {
      importFallback(rawText || "", false);
    });
  }

  // Reads every chosen file: images/PDFs become base64 (data + type) for the
  // AI to read directly; text files are inlined into the notes text.
  function getFilePayloads(files) {
    var fileDatas = [], fileTypes = [], texts = [];
    return Promise.all((files || []).map(function (f) {
      return getFilePayload(f).then(function (fp) {
        if (!fp) return;
        if (fp.error) throw new Error(fp.error);
        if (fp.text) texts.push(fp.text);
        else if (fp.data) { fileDatas.push(fp.data); fileTypes.push(fp.type); }
      });
    })).then(function () {
      return { fileDatas: fileDatas, fileTypes: fileTypes, text: texts.join("\n\n") };
    }, function (e) {
      return { error: (e && e.message) || "Couldn't read one of those files." };
    });
  }

  // Renders the chosen import attachments as removable thumbnails / chips.
  function renderPasteAttach() {
    var box = $("pasteAttach");
    if (!box) return;
    box.innerHTML = "";
    importFiles.forEach(function (file, idx) {
      var item = document.createElement("div");
      item.className = "paste-attach-item";
      if ((file.type || "").indexOf("image/") === 0) {
        var img = document.createElement("img");
        img.src = URL.createObjectURL(file);
        img.alt = "";
        item.appendChild(img);
      } else {
        item.classList.add("paste-attach-doc");
        var name = document.createElement("span");
        name.className = "paste-attach-name";
        name.textContent = "📄 " + file.name;
        item.appendChild(name);
      }
      var x = document.createElement("button");
      x.type = "button";
      x.className = "paste-attach-x";
      x.textContent = "×";
      x.setAttribute("aria-label", "Remove");
      x.addEventListener("click", function () { importFiles.splice(idx, 1); renderPasteAttach(); });
      item.appendChild(x);
      box.appendChild(item);
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
    initHistory();
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
      // First question — return to the "paste or start from scratch" chooser.
      showStart();
    }
  }

  /* ---------- AI Polish (keyless — runs through the GotIt Guides backend) ---------- */

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
    return GotItStore.ai("polish", {
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

  // Upload a photo / PDF / text file and read its content into a field.
  // opts: { btn, question, get:()=>string, set:(text)=>void }. Text files drop
  // straight in; images/PDFs go through the AI. Result is appended, ready to edit.
  function readFileIntoField(opts) {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,application/pdf,.txt,.md,.csv,text/plain";
    input.addEventListener("change", function () {
      var file = input.files[0];
      if (!file) return;
      var orig = opts.btn.textContent;
      opts.btn.disabled = true; opts.btn.textContent = "📎 Reading…";
      function done() { opts.btn.disabled = false; opts.btn.textContent = orig; }
      function apply(t) {
        var cur = (opts.get() || "").trim();
        if (cur === "Tap to add details…") cur = "";
        opts.set(cur ? cur + "\n" + t : t);
      }
      getFilePayload(file).then(function (payload) {
        if (!payload) { done(); return; }
        if (payload.error) { showToast(payload.error); done(); return; }
        if (payload.text != null) { // plain text — drop straight in
          apply(payload.text.trim());
          showToast("Added — tidy it with ✨ Polish.");
          done(); return;
        }
        // image / PDF — let the AI read it for this field
        var ctx = aiCtx(opts.question);
        GotItStore.ai("field", {
          category: ctx.category, question: ctx.question,
          fileData: payload.data, fileType: payload.type
        }).then(function (res) {
          if (!res) { showToast("AI isn't available right now — try typing it in."); done(); return; }
          var t = (res.text || "").trim();
          if (!t) { showToast("Couldn't find anything to add from that file."); done(); return; }
          apply(t);
          showToast("Added from your file — tweak or ✨ Polish.");
          done();
        }, function () { showToast("Couldn't read that file with AI — try typing it in."); done(); });
      }, function () { showToast("Couldn't read that file."); done(); });
    });
    input.click();
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
        var m = state.media[q.id] || {};
        sections.push({
          id: uid(),
          icon: q.icon || "📄",
          title: fillName(q.sectionTitle || q.q),
          body: val || "Tap to add details…",
          photo: m.photo || null,
          videoEmbed: m.videoEmbed || null,
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
      initHistory();
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
    updateSlugUI();
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
    applyCover(cover, g);
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
    reselectAfterRender();
  }

  function findSection(id) {
    return state.guide.sections.filter(function (s) { return s.id === id; })[0];
  }
  function findLog(id) {
    return state.guide.logs.filter(function (l) { return l.id === id; })[0];
  }

  // Paints the cover photo (with a dark overlay for legible text) or clears it.
  function applyCover(coverEl, g) {
    if (g.cover) {
      coverEl.classList.add("has-cover");
      coverEl.style.backgroundImage =
        "linear-gradient(180deg, rgba(26,26,26,0.28), rgba(26,26,26,0.55)), url(" + g.cover + ")";
    } else {
      coverEl.classList.remove("has-cover");
      coverEl.style.backgroundImage = "";
      GotItStore.applyCoverAccent(coverEl, g.coverColor); // colour gradient, or revert
    }
  }

  // ---- Image helpers: downscale + re-encode so guides fit the store limit ----
  function readFileAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
  function loadImageEl(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }
  function encodeJpeg(img, maxDim, quality) {
    var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    var cw = Math.max(1, Math.round(img.width * scale));
    var ch = Math.max(1, Math.round(img.height * scale));
    var canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    canvas.getContext("2d").drawImage(img, 0, 0, cw, ch);
    try { return canvas.toDataURL("image/jpeg", quality); }
    catch (e) { return null; }
  }
  // Re-encode a loaded image, stepping down quality (then size) until it fits
  // within maxBytes (data-URL character length). No budget = single pass.
  function encodeToBudget(img, maxDim, quality, maxBytes) {
    var dim = maxDim, q = quality;
    var out = encodeJpeg(img, dim, q);
    if (!out || !maxBytes) return out;
    var guard = 0;
    while (out.length > maxBytes && guard++ < 16) {
      if (q > 0.4) { q = Math.round((q - 0.08) * 100) / 100; }
      else { dim = Math.round(dim * 0.82); q = 0.6; if (dim < 320) break; }
      var next = encodeJpeg(img, dim, q);
      if (!next) break;
      out = next;
    }
    return out;
  }
  // Compress an uploaded file to (optionally) fit within maxBytes.
  function compressImage(file, maxDim, quality, maxBytes) {
    return readFileAsDataURL(file).then(function (srcUrl) {
      return loadImageEl(srcUrl).then(function (img) {
        return encodeToBudget(img, maxDim, quality, maxBytes) || srcUrl;
      }, function () { return srcUrl; }); // undecodable (e.g. some HEIC) → keep original
    });
  }

  // Collect mutable references to every stored image in a guide.
  function imageRefs(g) {
    var refs = [];
    if (g.cover) refs.push({ get: function () { return g.cover; }, set: function (v) { g.cover = v; } });
    (g.sections || []).forEach(function (s) {
      if (s.photo) refs.push({ get: function () { return s.photo; }, set: function (v) { s.photo = v; } });
    });
    return refs;
  }
  // Re-encode the guide's images so the whole guide JSON fits under `target`
  // characters. Returns whether the guide actually had any images to shrink.
  function shrinkImagesToTarget(g, target) {
    var refs = imageRefs(g);
    if (!refs.length) return Promise.resolve(false);
    var imgChars = refs.reduce(function (a, r) { return a + r.get().length; }, 0);
    var nonImg = JSON.stringify(g).length - imgChars;
    var budget = Math.max(30000, Math.floor((target - nonImg) / refs.length));
    return refs.reduce(function (chain, ref) {
      return chain.then(function () {
        return loadImageEl(ref.get()).then(function (img) {
          var out = encodeToBudget(img, 1400, 0.78, budget);
          if (out && out.length < ref.get().length) ref.set(out);
        }, function () {});
      });
    }, Promise.resolve()).then(function () { return true; });
  }
  // Build the object we'll actually store, auto-shrinking images (and retrying)
  // until the final payload — encrypted or not — fits the backend's hard limit.
  function buildStorable(g, locked, pass, hardLimit) {
    function attempt(n) {
      var prep = (locked && pass) ? GotItStore.encrypt(g, pass) : Promise.resolve(g);
      return prep.then(function (payloadObj) {
        if (JSON.stringify(payloadObj).length <= hardLimit) return payloadObj;
        if (n >= 5) throw new Error("__TOOBIG__");
        // Encryption re-encodes the (already base64) images, so aim lower when locked.
        var base = locked ? hardLimit / 1.45 : hardLimit;
        var target = Math.floor(base * Math.pow(0.82, n) - 1500);
        return shrinkImagesToTarget(g, target).then(function (hasImages) {
          if (!hasImages) throw new Error("__TOOBIG__");
          return attempt(n + 1);
        });
      });
    }
    return attempt(0);
  }

  function pickCover(coverEl) {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", function () {
      var file = input.files[0];
      if (!file) return;
      compressImage(file, 1400, 0.78, 300000).then(function (dataUrl) {
        state.guide.cover = dataUrl;
        applyCover(coverEl, state.guide);
        recordHistory();
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
    recordHistory(); // covers drag-reorder (not a click) and add/remove
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

  // A compact "➕ Add ▾" dropdown. items: [{label, onClick(triggerBtn)}].
  function makeAddMenu(items) {
    var wrap = document.createElement("div");
    wrap.className = "add-menu";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tool-btn add-menu-btn";
    btn.textContent = "➕ Add ▾";
    var menu = document.createElement("div");
    menu.className = "add-menu-list";
    menu.hidden = true;
    // The dropdown opens past the bottom of the section card, which is
    // overflow:hidden — so while it's open, let that card show overflow.
    function host() { return wrap.closest(".guide-section"); }
    function close() {
      menu.hidden = true;
      var h = host(); if (h) h.classList.remove("add-open");
      document.removeEventListener("click", onDoc);
    }
    function onDoc(e) { if (!wrap.contains(e.target)) close(); }
    items.forEach(function (it) {
      var mi = document.createElement("button");
      mi.type = "button";
      mi.className = "add-menu-item";
      mi.textContent = it.label;
      mi.addEventListener("click", function (e) { e.stopPropagation(); close(); it.onClick(btn); });
      menu.appendChild(mi);
    });
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (menu.hidden) {
        menu.hidden = false;
        var h = host(); if (h) h.classList.add("add-open");
        document.addEventListener("click", onDoc);
      } else close();
    });
    wrap.appendChild(btn);
    wrap.appendChild(menu);
    return wrap;
  }

  // A palette colour picker for a block. getKey()/setKey(key) read & write the
  // block's colour; the swatch dropdown reuses the Add menu's overflow-lift.
  function makeColorMenu(getKey, setKey, btnClass) {
    var wrap = document.createElement("div");
    wrap.className = "add-menu color-menu";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = (btnClass || "tool-btn") + " color-menu-btn";
    btn.appendChild(document.createTextNode("🎨 "));
    var dot = document.createElement("span");
    dot.className = "color-dot";
    btn.appendChild(dot);

    var menu = document.createElement("div");
    menu.className = "add-menu-list color-menu-list";
    menu.hidden = true;
    function host() { return wrap.closest(".guide-section"); }
    function close() { menu.hidden = true; var h = host(); if (h) h.classList.remove("add-open"); document.removeEventListener("click", onDoc); }
    function onDoc(e) { if (!wrap.contains(e.target)) close(); }

    function paint() {
      var key = getKey() || "default";
      var c = key !== "default" ? GotItStore.paletteColor(key) : null;
      dot.style.background = c ? c.accent : "";
      dot.classList.toggle("color-dot--none", !c);
      Array.prototype.forEach.call(menu.children, function (sw) {
        sw.classList.toggle("active", sw.getAttribute("data-key") === key);
      });
    }
    [{ key: "default" }].concat(GotItStore.palette).forEach(function (o) {
      var sw = document.createElement("button");
      sw.type = "button";
      sw.className = "swatch" + (o.key === "default" ? " swatch-default" : "");
      sw.setAttribute("data-key", o.key);
      if (o.accent) sw.style.background = o.accent;
      sw.title = o.key === "default" ? "No colour" : o.key;
      sw.addEventListener("click", function (e) { e.stopPropagation(); setKey(o.key); paint(); close(); });
      menu.appendChild(sw);
    });
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (menu.hidden) { menu.hidden = false; var h = host(); if (h) h.classList.add("add-open"); document.addEventListener("click", onDoc); }
      else close();
    });
    wrap.appendChild(btn);
    wrap.appendChild(menu);
    paint();
    return wrap;
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
        '<div class="acc-content" contenteditable="true">' + GotItStore.renderBody(sec.body) + "</div>" +
        '<div class="sec-media"></div>' +
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
    bindEditable(el.querySelector(".acc-content"), function (v) { sec.body = v; }, true);

    renderSectionMedia(el, sec);
    GotItStore.applyAccent(el, sec.color);
    return el;
  }

  function renderSectionMedia(el, sec) {
    var media = el.querySelector(".sec-media");
    media.innerHTML = "";
    // Each media item gets a clear "×" so you can remove just the photo or
    // just the video without deleting the whole section.
    function addItem(inner, onRemove, label) {
      var item = document.createElement("div");
      item.className = "sec-media-item";
      item.appendChild(inner);
      var x = document.createElement("button");
      x.type = "button";
      x.className = "sec-media-x";
      x.textContent = "×";
      x.title = label;
      x.setAttribute("aria-label", label);
      x.addEventListener("click", function () { onRemove(); renderSectionMedia(el, sec); recordHistory(); });
      item.appendChild(x);
      media.appendChild(item);
    }
    if (sec.photo) {
      var img = document.createElement("img");
      img.className = "sec-photo";
      img.src = sec.photo;
      img.alt = "";
      addItem(img, function () { sec.photo = null; }, "Remove photo");
    }
    var vsrc = videoSrc(sec);
    if (vsrc) {
      var v = document.createElement("div");
      v.className = "sec-video";
      v.innerHTML = '<iframe src="' + vsrc + '" allowfullscreen loading="lazy"></iframe>';
      addItem(v, function () { sec.videoEmbed = null; sec.videoId = null; }, "Remove video");
    }
  }

  function pickPhoto(sec, el) {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", function () {
      var file = input.files[0];
      if (!file) return;
      compressImage(file, 1200, 0.72, 220000).then(function (dataUrl) {
        sec.photo = dataUrl;
        renderSectionMedia(el, sec);
        if (!el.classList.contains("open")) el.classList.add("open");
        recordHistory();
      });
    });
    input.click();
  }

  /* ---------- Add-a-video modal (upload + link) ---------- */
  var videoOnAdd = null;
  var videoUploading = false;
  function openVideoModal(onAdd) {
    videoOnAdd = onAdd;
    videoUploading = false;
    $("videoErr").hidden = true;
    $("videoUrl").value = "";
    $("videoFileInput").value = "";
    setVideoProgress(null);
    $("videoUploadBtn").disabled = false;
    $("videoModal").hidden = false;
  }
  function closeVideoModal() {
    if (videoUploading) return; // don't drop a callback mid-upload
    $("videoModal").hidden = true;
    videoOnAdd = null;
  }
  function submitVideo() {
    var embed = parseVideo($("videoUrl").value);
    if (!embed) {
      var e = $("videoErr");
      e.textContent = "That doesn't look like a YouTube, Vimeo or Google Drive link.";
      e.hidden = false;
      return;
    }
    var cb = videoOnAdd;
    closeVideoModal();
    if (cb) cb(embed);
  }

  // Progress UI: pass a 0..1 fraction, a string label, or null to hide.
  function setVideoProgress(value, label) {
    var box = $("videoProgress");
    if (value == null) { box.hidden = true; return; }
    box.hidden = false;
    var pct = Math.max(0, Math.min(100, Math.round(value * 100)));
    $("videoProgressFill").style.width = pct + "%";
    $("videoProgressLabel").textContent = label || (pct + "%");
  }

  // Upload a chosen video to Cloudflare Stream and add it as a section video.
  function startVideoUpload(file) {
    if (!file) return;
    $("videoErr").hidden = true;
    if (file.size > 200 * 1024 * 1024) {
      var e = $("videoErr");
      e.textContent = "That video is too big (max about 200MB). Try a shorter clip.";
      e.hidden = false;
      return;
    }
    var cb = videoOnAdd;
    videoUploading = true;
    $("videoUploadBtn").disabled = true;
    setVideoProgress(0, "Preparing…");

    GotItStore.videoUploadUrl(150).then(function (res) {
      if (!res || !res.uploadURL) {
        throw new Error((res && res.error) || "Video upload isn't available right now. You can paste a link instead.");
      }
      return new Promise(function (resolve, reject) {
        var form = new FormData();
        form.append("file", file);
        var xhr = new XMLHttpRequest();
        xhr.open("POST", res.uploadURL, true);
        xhr.upload.onprogress = function (ev) {
          if (ev.lengthComputable) setVideoProgress(ev.loaded / ev.total, "Uploading… " + Math.round(ev.loaded / ev.total * 100) + "%");
        };
        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) resolve("https://iframe.videodelivery.net/" + res.uid);
          else reject(new Error("Upload failed. Please try again."));
        };
        xhr.onerror = function () { reject(new Error("Upload failed. Check your connection and try again.")); };
        xhr.send(form);
      });
    }).then(function (embedUrl) {
      setVideoProgress(1, "Done ✓");
      videoUploading = false;
      $("videoModal").hidden = true;
      videoOnAdd = null;
      if (cb) cb(embedUrl);
      showToast("Video added — it'll be ready to play in a few seconds.");
    }).catch(function (err) {
      videoUploading = false;
      $("videoUploadBtn").disabled = false;
      setVideoProgress(null);
      var e = $("videoErr");
      e.textContent = (err && err.message) || "Something went wrong. Please try again.";
      e.hidden = false;
    });
  }

  /* ---------- Per-step media (photo / video) in the question flow ---------- */
  function pickStepPhoto(qid) {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", function () {
      var file = input.files[0];
      if (!file) return;
      compressImage(file, 1200, 0.72, 220000).then(function (dataUrl) {
        (state.media[qid] = state.media[qid] || {}).photo = dataUrl;
        renderStepMedia(qid);
      });
    });
    input.click();
  }
  function renderStepMedia(qid) {
    var box = $("qMedia");
    if (!box) return;
    var m = state.media[qid] || {};
    box.innerHTML = "";
    if (m.photo) {
      var fig = document.createElement("div");
      fig.className = "q-media-item";
      fig.innerHTML = '<img src="' + m.photo + '" alt="" />';
      var rm = document.createElement("button");
      rm.type = "button"; rm.className = "q-media-x"; rm.textContent = "×";
      rm.setAttribute("aria-label", "Remove photo");
      rm.addEventListener("click", function () { delete state.media[qid].photo; renderStepMedia(qid); });
      fig.appendChild(rm);
      box.appendChild(fig);
    }
    if (m.videoEmbed) {
      var vid = document.createElement("div");
      vid.className = "q-media-item q-media-vid";
      vid.innerHTML = "<span>🎬 Video added</span>";
      var rmv = document.createElement("button");
      rmv.type = "button"; rmv.className = "q-media-x"; rmv.textContent = "×";
      rmv.setAttribute("aria-label", "Remove video");
      rmv.addEventListener("click", function () { delete state.media[qid].videoEmbed; renderStepMedia(qid); });
      vid.appendChild(rmv);
      box.appendChild(vid);
    }
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
    GotItStore.applyAccent(el, g.emergencyColor);
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
        '<span class="log-icon">📓</span> <span contenteditable="true" class="log-title">' + esc(log.title) + "</span>" +
      "</div>";
    enableDrag(el.querySelector(".drag-handle"), el);
    bindEditable(el.querySelector(".log-title"), function (v) { log.title = v; });
    GotItStore.applyAccent(el, log.color);

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
  function bindEditable(node, onChange, html) {
    if (!node) return;
    node.addEventListener("blur", function () {
      onChange(html ? GotItStore.sanitizeHtml(node.innerHTML) : node.innerText.trim());
    });
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
  // Turn a YouTube / Vimeo / public Google Drive link into an embeddable URL.
  function parseVideo(url) {
    if (!url) return null;
    url = url.trim();
    var yt = parseYouTube(url);
    if (yt) return "https://www.youtube.com/embed/" + yt;
    var vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vimeo) return "https://player.vimeo.com/video/" + vimeo[1];
    var drive = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]+)/);
    if (drive) return "https://drive.google.com/file/d/" + drive[1] + "/preview";
    return null;
  }
  // The embeddable video URL for a section (supports legacy youtube videoId).
  function videoSrc(sec) {
    if (sec.videoEmbed) return sec.videoEmbed;
    if (sec.videoId) return "https://www.youtube.com/embed/" + sec.videoId;
    return null;
  }

  /* ---------- Guide code (lock) controls (step 3) ---------- */
  function toggleLockUI() {
    var on = $("lockOn").checked;
    $("lockPass").hidden = !on;
    $("lockHint").hidden = !on;
    if (on) setTimeout(function () { $("lockPass").focus(); }, 50);
  }

  // Custom link control. The link is the guide's record id, so it can only be
  // chosen before the first publish; afterwards it's shown locked.
  function updateSlugUI() {
    var row = $("slugRow");
    if (!row) return;
    var input = $("slugInput");
    var prefix = $("slugPrefix");
    if (prefix) prefix.textContent = location.host + "/g/";
    if (state.created) {
      input.value = state.guide.slug;
      input.disabled = true;
      row.classList.add("locked");
      $("slugHint").textContent = "This is your guide's link — set when it was first published.";
    } else {
      input.disabled = false;
      row.classList.remove("locked");
      $("slugHint").textContent = "Pick a fun, memorable web address for your guide — or leave it blank and we'll make one for you. Letters, numbers and hyphens only.";
    }
  }

  // Apply the optional custom link name (new guides only). Resolves once
  // state.guide.slug is final; rejects with "__HANDLED__" after showing a toast.
  function resolveSlug() {
    if (state.created) return Promise.resolve();
    var input = $("slugInput");
    var custom = normalizeSlug(input ? input.value : "");
    if (!custom) return Promise.resolve(); // keep the auto-generated slug
    if (custom.length < 2) {
      showToast("Link name needs at least 2 characters.");
      return Promise.reject(new Error("__HANDLED__"));
    }
    if (custom === state.guide.slug) return Promise.resolve();
    return GotItStore.get(custom).then(function (existing) {
      if (existing) {
        showToast("“" + custom + "” is taken — try another link name.");
        throw new Error("__HANDLED__");
      }
      state.guide.slug = custom;
    });
  }

  /* ---------- Step 4: publish & share ---------- */
  function publish() {
    var g = state.guide;
    if (!state.editToken) state.editToken = makeToken();

    var locked = $("lockOn").checked;
    var pass = locked ? ($("lockPass").value || "").trim() : "";
    if (locked && !pass) { showToast("Enter a guide code, or untick the lock."); return; }
    if (locked && !GotItStore.canEncrypt()) {
      showToast("Guide codes need the live (https) site.");
      return;
    }

    var btn = $("publishBtn");
    btn.disabled = true;
    btn.textContent = "Publishing…";

    // Resolve the optional custom link name, then resize/encrypt and store.
    resolveSlug().then(function () {
      return buildStorable(g, locked, pass, 380000);
    }).then(function (payloadObj) {
      state.password = pass; // remember for re-publish in this session
      var op = state.created
        ? GotItStore.update(payloadObj)
        : GotItStore.create(payloadObj, state.editToken);
      return op;
    }).then(function (res) {
      var firstPublish = !state.created;
      state.created = true;
      if (firstPublish) GotItStore.event("publish", g.slug); // analytics (best-effort)
      renderGuideEditor(); // reflect any auto-resized images in the editor
      showShare(g, res && res.cloud, locked);
      touchDashboard(g, locked); // keep a saved copy's title/lock/updated fresh
    }).catch(function (err) {
      if (err && err.message === "__HANDLED__") { /* toast already shown */ }
      else if (err && err.message === "__TOOBIG__") {
        showToast("Even after resizing, there's too much image data — try removing a photo.");
      } else {
        showToast("Couldn't publish: " + (err.message || "try again"));
      }
    }).then(function () {
      btn.disabled = false;
      btn.textContent = "Publish & share →";
    });
  }

  // Optional: email the creator their links (and password, if the guide is
  // locked) so a lost edit link doesn't orphan the guide.
  function emailMyLinks() {
    var input = $("emailLinksInput");
    var note = $("emailLinksNote");
    var btn = $("emailLinksBtn");
    var email = (input.value || "").trim();
    function say(kind, msg) { note.className = "email-links-note " + kind; note.textContent = msg; note.hidden = false; }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      say("err", "Please enter a valid email address.");
      input.focus();
      return;
    }
    var g = state.guide;
    btn.disabled = true; btn.textContent = "Sending…";
    note.hidden = true;

    GotItStore.sendLinks({
      email: email,
      slug: g.slug,
      editToken: state.editToken,
      origin: window.location.origin,
      title: g.title,
      emoji: g.emoji,
      password: state.password || ""
    }).then(function (res) {
      if (res === null) {
        say("err", "Emailing links needs the published (online) site.");
      } else {
        say("ok", "✓ Sent — check your inbox (and spam folder).");
        input.value = "";
      }
    }).catch(function (err) {
      say("err", "Couldn't send: " + (err.message || "try again") + ".");
    }).then(function () {
      btn.disabled = false; btn.textContent = "Send";
    });
  }

  function showShare(g, isCloud, locked) {
    var url = viewUrl(g.slug);
    var editLink = pageUrl("builder.html", "g=" + encodeURIComponent(g.slug) + "&t=" + encodeURIComponent(state.editToken));

    $("shareEmoji").textContent = g.emoji;
    $("shareTitle").textContent = g.title;
    var sub = document.querySelector("#step4 .share-sub");
    if (sub) {
      sub.textContent = locked
        ? "🔒 Locked — only people with the guide code can open it."
        : "Anyone with this link can view it.";
    }
    // Reset the "email me my links" field; note whether the password is included.
    $("emailLinksInput").value = "";
    $("emailLinksNote").hidden = true;
    $("emailLinksHint").textContent = locked
      ? "Includes your view link, edit link and guide code. ⚠️ Anyone who sees that email can open the guide."
      : "So you don't lose them — includes your view and edit links.";

    $("shareUrl").value = url;
    $("editUrl").value = editLink;
    $("openGuide").href = url;
    if ($("printGuide")) $("printGuide").href = url + "?print=1";

    // Share-to channels
    var msg = "Check out my guide on GotIt Guides — " + g.title + ": " + url;
    $("shareWhatsapp").href = "https://wa.me/?text=" + encodeURIComponent(msg);
    $("shareSms").href = "sms:?&body=" + encodeURIComponent(msg);
    $("shareEmail").href = "mailto:?subject=" + encodeURIComponent(g.title + " — a guide made with GotIt Guides") +
      "&body=" + encodeURIComponent(msg);

    var nativeBtn = $("shareNative");
    if (navigator.share) {
      nativeBtn.hidden = false;
      nativeBtn.onclick = function () {
        navigator.share({ title: g.title, text: "Check out my guide on GotIt Guides:", url: url })
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
  // Pretty, shareable view URL: <origin>/g/<slug> (served via a hosting rewrite).
  function viewUrl(slug) {
    var base = location.href.replace(/[^/]*(\?.*)?(#.*)?$/, "");
    return base + "g/" + encodeURIComponent(slug);
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
    a.download = "gotit-" + state.guide.slug + "-qr.png";
    a.click();
  }

  /* ---------- Block selection + the floating dock ---------- */
  function selectBlock(el) {
    if (!el) return;
    if (selectedEl && selectedEl !== el) selectedEl.classList.remove("selected");
    selectedEl = el;
    el.classList.add("selected");
    if (el.classList.contains("guide-section")) { selectedType = "section"; selectedRef = findSection(el.dataset.id); }
    else if (el.classList.contains("guide-log")) { selectedType = "log"; selectedRef = findLog(el.dataset.id); }
    else if (el.classList.contains("guide-emergency")) { selectedType = "emergency"; selectedRef = state.guide; }
    else if (el.classList.contains("guide-cover")) { selectedType = "cover"; selectedRef = state.guide; }
    else { selectedType = null; selectedRef = null; }
    closeDockPop();
    updateDock();
  }
  function deselect() {
    if (selectedEl) selectedEl.classList.remove("selected");
    selectedEl = null; selectedType = null; selectedRef = null;
    closeDockPop();
    updateDock();
  }
  // Re-bind the selection to the same block after a full re-render (undo/redo),
  // or fall back to the first block so the dock is immediately usable.
  function reselectAfterRender() {
    var want = selectedType, ref = selectedRef, doc = $("guideDoc"), target = null;
    selectedEl = null;
    if (want === "section" && ref) target = doc.querySelector('.guide-section[data-id="' + ref.id + '"]');
    else if (want === "log" && ref) target = doc.querySelector('.guide-log[data-id="' + ref.id + '"]');
    else if (want === "emergency") target = doc.querySelector(".guide-emergency");
    else if (want === "cover") target = doc.querySelector(".guide-cover");
    if (!target) target = doc.querySelector(".guide-section") || doc.querySelector(".guide-cover");
    if (target) selectBlock(target);
    else { selectedType = null; selectedRef = null; updateDock(); }
  }

  var DOCK_CAPS = {
    section: { colour: 1, format: 1, media: 1, polish: 1, delete: 1 },
    log: { colour: 1, delete: 1 },
    emergency: { colour: 1 },
    cover: { colour: 1, media: 1 }
  };
  function updateDock() {
    var cap = (selectedType && DOCK_CAPS[selectedType]) || {};
    [["dockColour", cap.colour], ["dockFormat", cap.format], ["dockMedia", cap.media],
     ["dockPolish", cap.polish], ["dockDelete", cap.delete]].forEach(function (p) {
      var b = $(p[0]); if (b) b.disabled = !p[1];
    });
    var w = $("dockWidget"); if (w) w.classList.toggle("dim", !selectedType);
  }

  function closeDockPop() {
    var pop = $("dockPop");
    if (pop) { pop.hidden = true; pop.innerHTML = ""; }
    Array.prototype.forEach.call(document.querySelectorAll("#editDock .dock-btn.on"), function (b) { b.classList.remove("on"); });
  }
  function openDockPop(btn, build) {
    if (btn.disabled) return;
    var pop = $("dockPop");
    var wasOpen = btn.classList.contains("on");
    closeDockPop();
    if (wasOpen) return; // second click closes
    build(pop);
    pop.hidden = false;
    btn.classList.add("on");
    pop.style.top = btn.offsetTop + "px"; // align with the button (desktop)
  }

  function buildColourPop(pop) {
    pop.className = "dock-pop dock-pop-swatches";
    var current = selectedType === "section" || selectedType === "log" ? (selectedRef && selectedRef.color)
      : selectedType === "emergency" ? state.guide.emergencyColor
      : selectedType === "cover" ? state.guide.coverColor : null;
    [{ key: "default" }].concat(GotItStore.palette).forEach(function (o) {
      var sw = document.createElement("button");
      sw.type = "button";
      sw.className = "swatch" + (o.key === "default" ? " swatch-default" : "") + ((o.key === (current || "default")) ? " active" : "");
      if (o.accent) sw.style.background = o.accent;
      sw.title = o.key === "default" ? "No colour" : o.key;
      sw.addEventListener("click", function (e) { e.stopPropagation(); applySelectedColour(o.key); closeDockPop(); });
      pop.appendChild(sw);
    });
  }
  function applySelectedColour(key) {
    var k = key === "default" ? null : key;
    if (selectedType === "section" || selectedType === "log") { selectedRef.color = k; GotItStore.applyAccent(selectedEl, k); }
    else if (selectedType === "emergency") { state.guide.emergencyColor = k; GotItStore.applyAccent(selectedEl, k); }
    else if (selectedType === "cover") { state.guide.coverColor = k; applyCover(selectedEl, state.guide); }
    recordHistory();
  }

  function buildFormatPop(pop) {
    pop.className = "dock-pop dock-pop-row";
    [["B", "bold"], ["I", "italic"], ["•", "insertUnorderedList"], ["1.", "insertOrderedList"]].forEach(function (f) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "dock-pop-btn"; b.textContent = f[0];
      if (f[1] === "bold") b.style.fontWeight = "800";
      if (f[1] === "italic") b.style.fontStyle = "italic";
      b.addEventListener("mousedown", function (e) { e.preventDefault(); }); // keep the text selection
      b.addEventListener("click", function (e) { e.stopPropagation(); applyFormat(f[1]); });
      pop.appendChild(b);
    });
  }
  function applyFormat(cmd) {
    if (selectedType !== "section") return;
    var content = selectedEl.querySelector(".acc-content");
    if (!selectedEl.classList.contains("open")) selectedEl.classList.add("open");
    content.focus();
    try { document.execCommand(cmd, false, null); } catch (e) {}
    selectedRef.body = GotItStore.sanitizeHtml(content.innerHTML);
    recordHistory();
  }

  function buildMediaPop(pop) {
    pop.className = "dock-pop dock-pop-list";
    function item(label, fn) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "dock-pop-btn dock-pop-wide"; b.textContent = label;
      b.addEventListener("click", function (e) { e.stopPropagation(); closeDockPop(); fn(); });
      pop.appendChild(b);
    }
    if (selectedType === "cover") {
      item("📸 " + (state.guide.cover ? "Change photo" : "Add a photo"), function () { pickCover(selectedEl); });
      if (state.guide.cover) item("🗑 Remove photo", function () { state.guide.cover = null; applyCover(selectedEl, state.guide); recordHistory(); });
      return;
    }
    var sec = selectedRef, el = selectedEl;
    if (!el.classList.contains("open")) el.classList.add("open");
    item("📷 Photo", function () { pickPhoto(sec, el); });
    item("🎬 Video", function () {
      openVideoModal(function (embed) { sec.videoEmbed = embed; renderSectionMedia(el, sec); el.classList.add("open"); recordHistory(); });
    });
    item("📎 File", function () {
      var content = el.querySelector(".acc-content");
      readFileIntoField({ btn: $("dockMedia"), question: sec.title,
        get: function () { return content.innerText; },
        set: function (v) { content.innerText = v; sec.body = v; recordHistory(); } });
    });
  }

  function dockPolish() {
    if (selectedType !== "section") return;
    var content = selectedEl.querySelector(".acc-content"), sec = selectedRef;
    if (!selectedEl.classList.contains("open")) selectedEl.classList.add("open");
    polishInto(function () { return content.innerText; },
      function (v) { content.innerText = v; sec.body = v; recordHistory(); }, $("dockPolish"), aiCtx(sec.title));
  }
  function dockDelete() {
    if (selectedType === "section") state.guide.sections = state.guide.sections.filter(function (s) { return s.id !== selectedRef.id; });
    else if (selectedType === "log") state.guide.logs = state.guide.logs.filter(function (l) { return l.id !== selectedRef.id; });
    else return;
    var el = selectedEl;
    deselect();
    if (el) el.remove();
    syncBlockOrder();
    reselectAfterRender();
  }

  /* ---------- Wire up ---------- */
  renderCategories();
  $("qNext").addEventListener("click", nextQuestion);
  $("qBack").addEventListener("click", prevQuestion);

  // Start chooser: paste existing notes vs start from scratch
  $("startScratch").addEventListener("click", startFromScratch);
  $("startPaste").addEventListener("click", revealPaste);
  $("startBack").addEventListener("click", function () { showStep(1); });
  // Either picker (photos or a file) appends to the import attachment list.
  var MAX_IMPORT_FILES = 10;
  function onPasteAttach(input) {
    var chosen = Array.prototype.slice.call(input.files || []);
    var room = MAX_IMPORT_FILES - importFiles.length;
    if (chosen.length > room) {
      chosen = chosen.slice(0, Math.max(0, room));
      showToast("You can add up to " + MAX_IMPORT_FILES + " photos or files.");
    }
    chosen.forEach(function (f) { importFiles.push(f); });
    input.value = ""; // let the same file be re-picked and re-fire change
    renderPasteAttach();
  }
  $("pasteFile").addEventListener("change", function () { onPasteAttach($("pasteFile")); });
  $("pastePhoto").addEventListener("change", function () { onPasteAttach($("pastePhoto")); });
  $("pasteGo").addEventListener("click", function () {
    runImport($("pasteText").value.trim(), importFiles);
  });
  $("previewBack").addEventListener("click", function () {
    state.qIndex = state.category.questions.length - 1;
    renderQuestion();
    showStep(2);
  });
  $("addSection").addEventListener("click", addSection);
  $("addLog").addEventListener("click", addLog);
  $("publishBtn").addEventListener("click", publish);
  $("editAgain").addEventListener("click", function () { showStep(3); });

  // History: snapshot on edits (typing debounced; structural clicks too).
  $("guideDoc").addEventListener("input", scheduleHistory);
  $("step3").addEventListener("click", function (e) {
    if (e.target.closest("#publishBtn,#previewBack")) return;
    scheduleHistory();
  });
  // Tap a block to select it (so the dock's widget actions target it).
  $("guideDoc").addEventListener("click", function (e) {
    var block = e.target.closest(".guide-section, .guide-log, .guide-emergency, .guide-cover");
    if (block) selectBlock(block); else deselect();
  });

  // Global controls
  $("undoFab").addEventListener("click", undo);
  $("redoFab").addEventListener("click", redo);
  $("dockFeedback").addEventListener("click", function () { openFeedback(); });
  document.addEventListener("keydown", function (e) {
    if (currentStepKey !== 3 || !(e.metaKey || e.ctrlKey)) return;
    var k = (e.key || "").toLowerCase();
    if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redo(); }
  });

  // Widget actions
  $("dockColour").addEventListener("click", function (e) { e.stopPropagation(); openDockPop(this, buildColourPop); });
  $("dockFormat").addEventListener("mousedown", function (e) { e.preventDefault(); }); // keep selection
  $("dockFormat").addEventListener("click", function (e) { e.stopPropagation(); openDockPop(this, buildFormatPop); });
  $("dockMedia").addEventListener("click", function (e) { e.stopPropagation(); openDockPop(this, buildMediaPop); });
  $("dockPolish").addEventListener("click", function (e) { e.stopPropagation(); dockPolish(); });
  $("dockDelete").addEventListener("click", function (e) { e.stopPropagation(); dockDelete(); });
  // Close the popover when clicking away from the dock.
  document.addEventListener("click", function (e) {
    if (!e.target.closest("#editDock")) closeDockPop();
  });
  $("copyBtn").addEventListener("click", function () { logShare(); copyFrom("shareUrl", "Link copied!"); });
  $("copyEditBtn").addEventListener("click", function () { copyFrom("editUrl", "Edit link copied!"); });
  $("downloadQr").addEventListener("click", downloadQR);

  /* ---- "Save to my guides" (optional account at share time) ----
     If already signed in, save straight away. Otherwise stash the guide and
     send the user to sign in; the dashboard completes the save on return. */
  function currentSavePayload() {
    if (!state.guide) return null;
    return {
      slug: state.guide.slug,
      editToken: state.editToken,
      title: state.guide.title,
      emoji: state.guide.emoji,
      status: "published",
      locked: !!state.password
    };
  }
  // Best-effort: if this guide is already in the signed-in user's dashboard,
  // refresh its title/emoji/lock state (and bump "updated") after a re-publish.
  function touchDashboard(g, locked) {
    if (!window.GotItAuth || !GotItAuth.isSignedIn()) return;
    GotItAuth.idToken().then(function (tok) {
      if (!tok) return;
      GotItStore.listSavedGuides(tok).then(function (items) {
        var row = items.filter(function (x) { return x.slug === g.slug; })[0];
        if (row) GotItStore.updateSavedGuide(tok, row.id, { title: g.title, emoji: g.emoji, locked: !!locked });
      });
    }).catch(function () {});
  }
  function saveDashNote(msg, ok) {
    var n = $("saveToDashNote");
    if (!n) return;
    n.textContent = msg;
    n.hidden = false;
    n.style.color = ok ? "var(--green, #22A06B)" : "";
  }
  if ($("saveToDash")) {
    $("saveToDash").addEventListener("click", function () {
      var payload = currentSavePayload();
      if (!payload || !window.GotItAuth) return;
      var btn = this;
      if (GotItAuth.isSignedIn()) {
        btn.disabled = true;
        saveDashNote("Saving…", false);
        GotItAuth.idToken().then(function (tok) {
          if (!tok) throw new Error("Please sign in.");
          return GotItStore.saveGuide(tok, payload);
        }).then(function () {
          saveDashNote("Saved to your dashboard ✓", true);
          if ($("myGuidesLink")) $("myGuidesLink").hidden = false;
          btn.textContent = "Saved ✓";
        }).catch(function (e) {
          btn.disabled = false;
          saveDashNote(e.message || "Couldn't save just now — please try again.", false);
        });
      } else {
        // Stash and sign in; dashboard.js finishes the save after the redirect.
        try { localStorage.setItem("gotit_pending_save", JSON.stringify(payload)); } catch (e) {}
        btn.disabled = true;
        saveDashNote("Taking you to sign in…", false);
        GotItAuth.signInWithGoogle().catch(function (e) {
          btn.disabled = false;
          saveDashNote(e.message || "Sign-in isn't available right now.", false);
        });
      }
    });
  }
  // Count a "share" when the link is copied or a share channel is used (best-effort).
  function logShare() { if (state.guide) GotItStore.event("share", state.guide.slug); }
  ["shareNative", "shareWhatsapp", "shareSms", "shareEmail"].forEach(function (id) {
    if ($(id)) $(id).addEventListener("click", logShare);
  });
  $("lockOn").addEventListener("change", toggleLockUI);
  if ($("slugInput")) {
    $("slugInput").addEventListener("input", function () {
      if (state.created) return;
      var c = normalizeSlug(this.value);
      $("slugHint").textContent = c
        ? "Your link will be: " + location.host + "/g/" + c
        : "Pick a fun, memorable web address for your guide — or leave it blank and we'll make one for you. Letters, numbers and hyphens only.";
    });
  }

  // Add-a-video modal
  $("videoAdd").addEventListener("click", submitVideo);
  $("videoUrl").addEventListener("keydown", function (e) { if (e.key === "Enter") submitVideo(); });
  $("videoUploadBtn").addEventListener("click", function () { $("videoFileInput").click(); });
  $("videoFileInput").addEventListener("change", function () { startVideoUpload(this.files[0]); });
  document.querySelectorAll("[data-vid-close]").forEach(function (el) {
    el.addEventListener("click", closeVideoModal);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("videoModal").hidden) closeVideoModal();
  });

  // Feedback widget
  $("feedbackFab").addEventListener("click", function () { openFeedback(); });
  if ($("shareFeedbackBtn")) {
    $("shareFeedbackBtn").addEventListener("click", function () {
      openFeedback("You just published a guide 🎉 What would make GotIt Guides better? Any idea, big or small, helps.");
    });
  }
  $("feedbackSend").addEventListener("click", sendFeedback);
  $("feedbackImg").addEventListener("change", function () {
    var file = this.files[0];
    if (!file) return;
    compressImage(file, 1280, 0.72, 380000).then(function (dataUrl) {
      feedbackImage = { data: dataUrl.split(",")[1], type: "image/jpeg" };
      $("feedbackImgThumb").src = dataUrl;
      $("feedbackImgPreview").hidden = false;
    });
  });
  $("feedbackImgRemove").addEventListener("click", clearFeedbackImage);
  document.querySelectorAll("[data-fb-close]").forEach(function (el) {
    el.addEventListener("click", closeFeedback);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("feedbackModal").hidden) closeFeedback();
  });
  $("emailLinksBtn").addEventListener("click", emailMyLinks);
  $("emailLinksInput").addEventListener("keydown", function (e) { if (e.key === "Enter") emailMyLinks(); });

  // Entry: an edit link (?g=slug&t=token) opens that guide; otherwise start fresh.
  function getParam(name) {
    var m = location.search.match(new RegExp("[?&]" + name + "=([^&]+)"));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function enterEditMode(slug, token) {
    steps.building.querySelector(".building-title").textContent = "Loading your guide…";
    showStep("building");
    GotItStore.getForEdit(slug).then(function (rec) {
      if (!rec || !rec.guide) {
        showToast("Guide not found.");
        showStep(1);
        return;
      }
      if (rec.editToken && token !== rec.editToken) {
        // Not the owner — send to the read-only view instead.
        window.location.href = viewUrl(slug);
        return;
      }
      if (GotItStore.isEncrypted(rec.guide)) {
        var pass = window.prompt("This guide is locked. Enter its guide code to edit (you can change or remove it after):");
        if (pass == null) { window.location.href = "index.html"; return; }
        GotItStore.decrypt(rec.guide, pass).then(function (real) {
          state.password = pass;
          $("lockOn").checked = true;
          toggleLockUI();
          $("lockPass").value = pass;
          finishEnterEdit(real, rec.editToken || token);
        }, function () {
          showToast("That code's not right.");
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
    initHistory();
  }

  function catById(id) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i];
    return null;
  }

  var editSlug = getParam("g");
  var editToken = getParam("t");
  var catParam = getParam("cat");
  autoPasteIntent = getParam("start") === "paste"; // homepage "Paste your notes" CTA
  if (editSlug && editToken) enterEditMode(editSlug, editToken);
  else if (catParam && catById(catParam)) pickCategory(catById(catParam)); // deep link from the homepage
  else showStep(1);
})();
