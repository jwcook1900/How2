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
        { id: "help", q: "Who do they call if something breaks?", hint: "Host or manager, plus local emergency.", ph: "Host: 0400 000 000\nEmergency: 000", type: "textarea", target: "section", icon: "🆘", sectionTitle: "Help & Contacts" }
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

  // Which auto-blocks a new guide starts with, by category. Daily Routine only
  // suits recurring-care guides (pets, kids, aged care); Emergency Contacts is
  // dropped for short-term rentals (its "who to call" answer goes into a normal
  // section instead, so nothing is lost). Everyone can add either block back
  // from the "add block" row.
  var ROUTINE_CATS = { pet: 1, kids: 1, care: 1 };
  var NO_EMERGENCY_CATS = { home: 1 };
  function guideBlockDefaults(catId) {
    return { noRoutine: !ROUTINE_CATS[catId], noEmergency: !!NO_EMERGENCY_CATS[catId] };
  }

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
    else applyDockPos(); // restore any dragged-to position on the edit step
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
    $("startTalk").classList.remove("active");
    $("startPaste").classList.remove("active");
    if ($("startPhoto")) $("startPhoto").classList.remove("active");
    $("startScratch").classList.remove("active");
    $("pasteText").value = "";
    if ($("pasteFile")) $("pasteFile").value = "";
    if ($("pastePhoto")) $("pastePhoto").value = "";
    if ($("pasteUrl")) $("pasteUrl").value = "";
    if ($("pasteUrlNote")) $("pasteUrlNote").hidden = true;
    $("startHeading").textContent = "How would you like to create your guide?";
    showStep("start");
    // Arrived from a homepage "Paste your notes" CTA — open the paste path.
    if (autoPasteIntent) {
      autoPasteIntent = false;
      revealImport("paste");
    }
  }

  // Opens the shared import panel. "talk" and "paste" feed the same AI-organise
  // pipeline — "talk" just reframes the copy to invite the phone keyboard's mic
  // (dictation fills the textarea), which works reliably on iOS + Android.
  function revealImport(mode) {
    var talk = mode === "talk";
    var photo = mode === "photo";
    GotItStore.event("start_" + (photo ? "photo" : talk ? "talk" : "paste")); // analytics (best-effort)
    $("startTalk").classList.toggle("active", talk);
    $("startPaste").classList.toggle("active", mode === "paste");
    if ($("startPhoto")) $("startPhoto").classList.toggle("active", photo);
    $("startScratch").classList.remove("active");
    var help = $("pasteHelp");
    var ta = $("pasteText");
    if (photo) {
      help.textContent = "Take a clear photo of each page of your existing guide — paper, a printout or a screenshot — and we'll read them in and build a clean digital guide.";
      ta.placeholder = "Optional: anything the photos don't cover…";
    } else if (talk) {
      help.textContent = "Tap the 🎙️ mic on your phone's keyboard and just talk — describe their day and the must-knows. GotIt Guides will turn it into a clean, organised guide.";
      ta.placeholder = 'Tap the keyboard mic and talk… e.g. "He eats at 7am and 6pm, walk after lunch, vet is Dr Smith on 9999 1234, and he\'s scared of the vacuum…"';
    } else {
      help.textContent = "Already written something in Notes, Google Docs, WhatsApp, SMS or email? Paste it here and GotIt Guides will turn it into a clean, organised guide.";
      ta.placeholder = "Paste your rough notes here. For example: feeding times, medication, bedtime routine, emergency contacts, house rules…";
    }
    $("pastePanel").removeAttribute("hidden");
    // Photo mode jumps straight to the camera / photo library.
    if (photo && $("pastePhoto")) {
      setTimeout(function () { $("pastePhoto").click(); }, 80);
    } else {
      setTimeout(function () {
        ta.focus();
        ta.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 60);
    }
  }

  function startFromScratch() {
    GotItStore.event("start_scratch"); // analytics (best-effort)
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

    var bd = guideBlockDefaults(cat.id);
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
      // Category defaults — but if the import found contacts, keep the emergency
      // block so they're not hidden.
      noRoutine: bd.noRoutine,
      noEmergency: bd.noEmergency && !contacts.length,
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

  /* ---------- Whole-guide "Polish" (AI review before publish) ----------
     Sends every editable text field to the AI in one pass; the AI improves
     wording/titles but preserves all facts. The creator reviews and approves
     each suggested change before anything is applied. */
  function stripHtml(s) {
    return String(s == null ? "" : s)
      .replace(/<br\s*\/?>/gi, " ").replace(/<\/(p|li|div)>/gi, " ")
      .replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  }
  function collectPolishItems(g) {
    var items = [];
    function add(id, kind, text) {
      if ((text == null ? "" : String(text)).trim()) items.push({ id: id, kind: kind, text: text });
    }
    add("cover:title", "title", g.title);
    add("cover:sub", "subtitle", g.subtitle);
    (g.sections || []).forEach(function (s) {
      if (s.title !== "New section") add("s:" + s.id + ":title", "sectionTitle", s.title);
      if ((s.body || "").trim() !== "Tap to add details…") add("s:" + s.id + ":body", "body", s.body);
    });
    return items;
  }
  function polishFieldLabel(g, id) {
    if (id === "cover:title") return "Guide title";
    if (id === "cover:sub") return "Guide subtitle";
    var m = /^s:(.+):(title|body)$/.exec(id);
    if (m) {
      var sec = findSection(m[1]);
      return ((sec && sec.title) || "Section") + (m[2] === "title" ? " — title" : " — text");
    }
    return "Field";
  }
  function applyPolishChange(g, id, text) {
    if (id === "cover:title") { g.title = text; return; }
    if (id === "cover:sub") { g.subtitle = text; return; }
    var m = /^s:(.+):(title|body)$/.exec(id);
    if (m) {
      var sec = findSection(m[1]);
      if (sec) { if (m[2] === "title") sec.title = text; else sec.body = text; }
    }
  }
  function masterPolish() {
    var g = state.guide;
    var items = collectPolishItems(g);
    if (!items.length) { showToast("Add some text first, then polish."); return; }
    var btn = $("masterPolishBtn");
    var orig = btn.textContent;
    btn.disabled = true; btn.textContent = "✨ Polishing your guide…";
    function done() { btn.disabled = false; btn.textContent = orig; }
    GotItStore.ai("guide", { text: JSON.stringify(items), category: g.category || "general" }).then(function (res) {
      done();
      if (res === null) { showToast("Polishing needs the live (online) site."); return; }
      var byId = {}; items.forEach(function (it) { byId[it.id] = String(it.text); });
      var real = ((res && res.changes) || []).filter(function (c) {
        return c && c.id && byId.hasOwnProperty(c.id) && typeof c.text === "string" &&
          c.text.trim() && c.text.trim() !== byId[c.id].trim();
      }).map(function (c) { c.before = byId[c.id]; return c; });
      if (!real.length) { showToast("Your guide already reads well ✨"); return; }
      openPolishReview(real);
    }, function () { done(); showToast("Couldn't polish just now — try again."); });
  }
  function closePolishReview() {
    var m = $("polishModal");
    if (m && m.parentNode) m.parentNode.removeChild(m);
  }
  function openPolishReview(changes) {
    var g = state.guide;
    closePolishReview();
    var overlay = document.createElement("div");
    overlay.className = "polish-modal"; overlay.id = "polishModal";
    var backdrop = document.createElement("div");
    backdrop.className = "polish-backdrop";
    backdrop.addEventListener("click", closePolishReview);
    var card = document.createElement("div");
    card.className = "polish-card";
    var x = document.createElement("button");
    x.type = "button"; x.className = "polish-x"; x.textContent = "×";
    x.setAttribute("aria-label", "Close"); x.addEventListener("click", closePolishReview);
    var h = document.createElement("h3");
    h.className = "polish-title"; h.textContent = "Suggested improvements";
    var lead = document.createElement("p");
    lead.className = "polish-lead";
    lead.textContent = "Tick the ones to apply. Facts are unchanged — this only tidies wording and titles.";
    var list = document.createElement("div");
    list.className = "polish-list";
    var checks = [];
    changes.forEach(function (c) {
      var row = document.createElement("label");
      row.className = "polish-row";
      var cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = true; cb.className = "polish-check";
      checks.push({ cb: cb, change: c });
      var bodyWrap = document.createElement("div");
      bodyWrap.className = "polish-row-body";
      var field = document.createElement("div");
      field.className = "polish-field"; field.textContent = polishFieldLabel(g, c.id);
      var before = document.createElement("div");
      before.className = "polish-before"; before.textContent = stripHtml(c.before);
      var after = document.createElement("div");
      after.className = "polish-after"; after.textContent = stripHtml(c.text);
      bodyWrap.appendChild(field); bodyWrap.appendChild(before); bodyWrap.appendChild(after);
      row.appendChild(cb); row.appendChild(bodyWrap);
      list.appendChild(row);
    });
    var actions = document.createElement("div");
    actions.className = "polish-actions";
    var cancel = document.createElement("button");
    cancel.type = "button"; cancel.className = "btn btn-ghost btn-sm"; cancel.textContent = "Cancel";
    cancel.addEventListener("click", closePolishReview);
    var apply = document.createElement("button");
    apply.type = "button"; apply.className = "btn btn-primary btn-sm"; apply.textContent = "Apply selected";
    apply.addEventListener("click", function () {
      var n = 0;
      checks.forEach(function (row) {
        if (row.cb.checked) { applyPolishChange(g, row.change.id, row.change.text); n++; }
      });
      closePolishReview();
      if (n) {
        renderGuideEditor();
        recordHistory();
        showToast(n === 1 ? "Applied 1 improvement ✨" : "Applied " + n + " improvements ✨");
      }
    });
    actions.appendChild(cancel); actions.appendChild(apply);
    card.appendChild(x); card.appendChild(h); card.appendChild(lead); card.appendChild(list); card.appendChild(actions);
    overlay.appendChild(backdrop); overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  // Wires a Polish button to read/replace a piece of text with a loading state.
  // `ctx` ({ category, question }) gives the AI context about what it's editing.
  function showPolishOverlay(on) {
    var o = $("polishOverlay");
    if (o) o.hidden = !on;
  }
  function polishInto(getText, setText, btn, ctx) {
    var text = (getText() || "").trim();
    if (!text || text === "Tap to add details…") { showToast("Nothing to polish yet."); return; }
    // Dim the whole screen with a centred sparkle while the AI works, rather
    // than squeezing "Polishing…" into a small round dock button.
    if (btn) btn.disabled = true;
    showPolishOverlay(true);
    polish(text, ctx).then(function (out) {
      setText(out);
    }).then(null, function () {}).then(function () {
      if (btn) btn.disabled = false;
      showPolishOverlay(false);
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

    var bd = guideBlockDefaults(cat.id);
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
      // Category defaults — but keep the emergency block if the flow gathered
      // any contacts (so they're never hidden).
      noRoutine: bd.noRoutine,
      noEmergency: bd.noEmergency && !contacts.length,
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

    // Cover. The emoji is shown unless the creator dismissed it (the "＋" add-
    // icon hint won't nag once dismissed). Title + subtitle live in a .cover-text
    // block that can be nudged up/down (g.coverTextY) while staying centred.
    var cover = document.createElement("div");
    cover.className = "guide-cover";
    var emojiHtml = g.coverEmojiOff ? "" :
      '<span class="cover-emoji" contenteditable="true" data-bind="emoji" role="textbox" aria-label="Cover icon — type an emoji, or backspace to remove it">' + esc(g.emoji || "") + "</span>";
    cover.innerHTML =
      '<div class="cover-text">' + emojiHtml +
        '<div class="cover-title" contenteditable="true" data-bind="title">' + esc(g.title) + "</div>" +
        '<div class="cover-sub" contenteditable="true" data-bind="subtitle">' + esc(g.subtitle) + "</div>" +
      "</div>" +
      '<button class="cover-emoji-x no-print" type="button" title="Remove the cover icon" aria-label="Remove the cover icon">✕</button>' +
      '<button class="cover-reposition-btn no-print" type="button" title="Reposition photo" aria-label="Reposition photo">' + MOVE_ICON_SVG + "</button>";
    var textEl = cover.querySelector(".cover-text");
    if (g.coverTextY) textEl.style.transform = "translateY(" + g.coverTextY + "px)";
    bindEditable(cover.querySelector('[data-bind="title"]'), function (v) { g.title = v; });
    bindEditable(cover.querySelector('[data-bind="subtitle"]'), function (v) { g.subtitle = v; });
    // The cover icon is editable: type/paste an emoji to change it, or backspace
    // it away. The ✕ removes it outright and stops the "＋" add-icon hint.
    var emojiEl = cover.querySelector('[data-bind="emoji"]');
    if (emojiEl) bindEditable(emojiEl, function (v) {
      g.emoji = (v || "").replace(/\s+/g, "").slice(0, 16);
      cover.classList.toggle("no-emoji", !g.emoji); // re-flow the title to the top when removed
      scheduleHistory();
    });
    var coverRepos = cover.querySelector(".cover-reposition-btn");
    if (coverRepos) {
      coverRepos.addEventListener("click", function (e) { e.stopPropagation(); startCoverReposition(cover); });
    }
    var emojiX = cover.querySelector(".cover-emoji-x");
    if (g.coverEmojiOff) emojiX.hidden = true;
    emojiX.addEventListener("click", function (e) {
      e.stopPropagation();
      g.emoji = ""; g.coverEmojiOff = true;
      var sp = cover.querySelector(".cover-emoji"); if (sp) sp.remove();
      cover.classList.add("no-emoji");
      emojiX.hidden = true;
      recordHistory();
    });
    applyCover(cover, g);
    doc.appendChild(cover);

    // Render blocks (sections / emergency / logs) in the saved order
    if (!g.blockOrder || !g.blockOrder.length) {
      g.blockOrder = g.sections.map(function (s) { return "s:" + s.id; })
        .concat(["e"]).concat(g.logs.map(function (l) { return "l:" + l.id; }));
    }
    // Emergency contacts: auto-included unless the creator removed the widget.
    if (g.noEmergency) g.blockOrder = g.blockOrder.filter(function (t) { return t !== "e"; });
    else if (g.blockOrder.indexOf("e") === -1) g.blockOrder.push("e");
    // The Daily Routine block (auto-included unless removed; only shows to
    // sitters once it has items). Default it just before the emergency contacts.
    if (g.noRoutine) g.blockOrder = g.blockOrder.filter(function (t) { return t !== "r"; });
    else if (g.blockOrder.indexOf("r") === -1) {
      var ei = g.blockOrder.indexOf("e");
      if (ei >= 0) g.blockOrder.splice(ei, 0, "r"); else g.blockOrder.push("r");
    }

    var rendered = {};
    var firstSection = true;
    g.blockOrder.forEach(function (tok) {
      if (tok === "e") {
        doc.appendChild(buildEmergencyEl());
        rendered.e = true;
      } else if (tok === "r") {
        doc.appendChild(buildRoutineEl());
        rendered.r = true;
      } else if (tok === "v") {
        doc.appendChild(buildVideosEl());
        rendered.v = true;
      } else if (tok.indexOf("s:") === 0) {
        var sec = findSection(tok.slice(2));
        if (sec) { doc.appendChild(buildSectionEl(sec, firstSection)); firstSection = false; rendered[tok] = true; }
      } else if (tok.indexOf("l:") === 0) {
        var log = findLog(tok.slice(2));
        if (log) { doc.appendChild(buildLogEl(log)); rendered[tok] = true; }
      }
    });
    // Reconcile anything missing from blockOrder (e.g. legacy guides)
    if (!g.noEmergency && !rendered.e) doc.appendChild(buildEmergencyEl());
    if (!g.noRoutine && !rendered.r) doc.appendChild(buildRoutineEl());
    if (g.videos && !rendered.v) doc.appendChild(buildVideosEl());
    g.sections.forEach(function (sec) {
      if (!rendered["s:" + sec.id]) { doc.appendChild(buildSectionEl(sec, firstSection)); firstSection = false; }
    });
    g.logs.forEach(function (log) {
      if (!rendered["l:" + log.id]) doc.appendChild(buildLogEl(log));
    });
    syncBlockOrder();
    reselectAfterRender();
    updateAddRow();
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
      coverEl.style.backgroundPosition = g.coverPos || "center";
    } else {
      coverEl.classList.remove("has-cover");
      coverEl.classList.remove("repositioning");
      coverEl.style.backgroundImage = "";
      coverEl.style.backgroundPosition = "";
      GotItStore.applyCoverAccent(coverEl, g.coverColor); // colour gradient, or revert
    }
    // With no icon, sit the title near the top so it clears the photo's subject.
    coverEl.classList.toggle("no-emoji", !g.emoji);
    // The reposition handle only makes sense once there's a photo to pan.
    var rb = coverEl.querySelector(".cover-reposition-btn");
    if (rb) rb.hidden = !g.cover;
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
      if (Array.isArray(s.photos)) {
        s.photos.forEach(function (p) {
          if (p && p.src) refs.push({ get: function () { return p.src; }, set: function (v) { p.src = v; } });
        });
      } else if (s.photo) {
        refs.push({ get: function () { return s.photo; }, set: function (v) { s.photo = v; } });
      }
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

  // Lets the creator drag the cover photo to choose which part of it shows
  // (background-size is "cover", so the image is cropped to the banner). The
  // chosen focal point is stored as a CSS background-position on g.coverPos.

  // Shared drag-to-reposition: the user drags `frameEl` to pan a cropped image;
  // `apply(pos)` paints the live position, `commit(pos)` stores it. `pos` is a
  // CSS position string like "50% 30%" used for both background- and
  // object-position. Returns nothing; cleans up after the user taps Done.
  function beginReposition(frameEl, startPos, apply, commit) {
    var parts = (startPos || "50% 50%").replace(/center/g, "50%").split(/\s+/);
    var posX = parseFloat(parts[0]); if (isNaN(posX)) posX = 50;
    var posY = parseFloat(parts[1]); if (isNaN(posY)) posY = 50;

    frameEl.classList.add("repositioning");
    var hint = document.createElement("div");
    hint.className = "cover-reposition-hint";
    hint.innerHTML = '<span>Drag to reposition</span>' +
      '<button type="button" class="cover-reposition-done">Done</button>';
    frameEl.appendChild(hint);

    var startX = 0, startY = 0, baseX = posX, baseY = posY, dragging = false;
    function onDown(e) {
      if (e.target.closest(".cover-reposition-done")) return;
      e.preventDefault();
      dragging = true; startX = e.clientX; startY = e.clientY; baseX = posX; baseY = posY;
      frameEl.setPointerCapture && frameEl.setPointerCapture(e.pointerId);
    }
    function onMove(e) {
      if (!dragging) return;
      var w = frameEl.clientWidth || 1, h = frameEl.clientHeight || 1;
      // Dragging right reveals the left of the image, so position decreases.
      posX = Math.max(0, Math.min(100, baseX - (e.clientX - startX) / w * 100));
      posY = Math.max(0, Math.min(100, baseY - (e.clientY - startY) / h * 100));
      apply(posX + "% " + posY + "%");
    }
    function onUp() { dragging = false; }
    function finish() {
      frameEl.removeEventListener("pointerdown", onDown);
      frameEl.removeEventListener("pointermove", onMove);
      frameEl.removeEventListener("pointerup", onUp);
      frameEl.classList.remove("repositioning");
      if (hint.parentNode) hint.parentNode.removeChild(hint);
      commit(posX + "% " + posY + "%");
      recordHistory();
    }
    frameEl.addEventListener("pointerdown", onDown);
    frameEl.addEventListener("pointermove", onMove);
    frameEl.addEventListener("pointerup", onUp);
    hint.querySelector(".cover-reposition-done").addEventListener("click", function (e) {
      e.stopPropagation(); finish();
    });
  }

  function startCoverReposition(coverEl) {
    if (!state.guide.cover) return;
    var g = state.guide;
    beginReposition(coverEl, g.coverPos,
      function (pos) { coverEl.style.backgroundPosition = pos; },
      function (pos) { g.coverPos = pos; });
  }

  // Drag the cover title/subtitle vertically (horizontal stays centred). Stored
  // as a pixel offset on g.coverTextY and applied to the .cover-text block.
  function startCoverTextMove(coverEl) {
    var g = state.guide;
    var textEl = coverEl.querySelector(".cover-text");
    if (!textEl) return;
    var MAX = 110; // clamp so the text can't be dragged off the cover
    var y = Math.max(-MAX, Math.min(MAX, g.coverTextY || 0));

    coverEl.classList.add("repositioning");
    var hint = document.createElement("div");
    hint.className = "cover-reposition-hint";
    hint.innerHTML = '<span>Drag the title up or down</span>' +
      '<button type="button" class="cover-reposition-done">Done</button>';
    coverEl.appendChild(hint);

    var startY = 0, base = y, dragging = false;
    function apply() { textEl.style.transform = "translateY(" + y + "px)"; }
    function onDown(e) {
      if (e.target.closest(".cover-reposition-done")) return;
      e.preventDefault();
      dragging = true; startY = e.clientY; base = y;
      coverEl.setPointerCapture && coverEl.setPointerCapture(e.pointerId);
    }
    function onMove(e) {
      if (!dragging) return;
      y = Math.max(-MAX, Math.min(MAX, base + (e.clientY - startY)));
      apply();
    }
    function onUp() { dragging = false; }
    function finish() {
      coverEl.removeEventListener("pointerdown", onDown);
      coverEl.removeEventListener("pointermove", onMove);
      coverEl.removeEventListener("pointerup", onUp);
      coverEl.classList.remove("repositioning");
      if (hint.parentNode) hint.parentNode.removeChild(hint);
      g.coverTextY = y;
      recordHistory();
    }
    coverEl.addEventListener("pointerdown", onDown);
    coverEl.addEventListener("pointermove", onMove);
    coverEl.addEventListener("pointerup", onUp);
    hint.querySelector(".cover-reposition-done").addEventListener("click", function (e) {
      e.stopPropagation(); finish();
    });
  }

  // Repositions a section photo. Section photos normally show in full; choosing
  // "reposition" crops them into a banner frame the user can pan (object-fit:
  // cover + object-position), stored on sec.photoPos.
  function startPhotoReposition(sec, photo, item) {
    if (!photo || !item) return;
    if (!photo.pos) photo.pos = "50% 50%"; // enter banner/crop mode
    var img = item.querySelector(".sec-photo");
    if (!img) return;
    img.classList.add("is-cropped");
    img.style.objectPosition = photo.pos;
    beginReposition(item, photo.pos,
      function (pos) { img.style.objectPosition = pos; },
      function (pos) { photo.pos = pos; });
  }

  // A four-directional "move" glyph, used on photos to enter reposition mode.
  var MOVE_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M3 12h18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/></svg>';

  // Records the current DOM order of all blocks (sections / emergency / logs).
  var DRAG_SELECTOR = ".guide-section, .guide-emergency, .guide-log, .guide-routine, .guide-videos";
  function syncBlockOrder() {
    var order = [];
    Array.prototype.forEach.call($("guideDoc").children, function (el) {
      if (el.classList.contains("guide-section")) order.push("s:" + el.dataset.id);
      else if (el.classList.contains("guide-emergency")) order.push("e");
      else if (el.classList.contains("guide-routine")) order.push("r");
      else if (el.classList.contains("guide-videos")) order.push("v");
      else if (el.classList.contains("guide-log")) order.push("l:" + el.dataset.id);
    });
    state.guide.blockOrder = order;
    recordHistory(); // covers drag-reorder (not a click) and add/remove
  }

  // Drag-to-reorder. On a mouse, grab the ⠿ grip and drag straight away. On a
  // touch screen, press and hold anywhere on the block's header for a moment —
  // the block lifts to show "move mode" is on — then drag up/down to reorder.
  // The hold means a normal tap still edits the title and a quick swipe still
  // scrolls the page; only a deliberate hold starts a move (no more accidental
  // text-selection when you meant to drag).
  function enableDrag(handle, blockEl) {
    if (!handle) return;
    var header = handle.parentNode; // .acc-header / .em-head / .routine-head / …
    var HOLD_MS = 300, CANCEL_PX = 12;
    var dragging = false;

    handle.addEventListener("click", function (e) { e.stopPropagation(); });
    function preventTouch(e) { if (dragging && e.cancelable) e.preventDefault(); }
    function swallowClick(e) { e.stopPropagation(); e.preventDefault(); blockEl.removeEventListener("click", swallowClick, true); }

    function startDrag() {
      if (dragging) return;
      dragging = true;
      var doc = $("guideDoc");
      blockEl.classList.add("dragging");
      document.body.classList.add("dragging-active");
      try { window.getSelection().removeAllRanges(); } catch (_) {}
      document.addEventListener("touchmove", preventTouch, { passive: false });

      function onMove(ev) {
        if (ev.cancelable) ev.preventDefault();
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
        dragging = false;
        blockEl.classList.remove("dragging");
        document.body.classList.remove("dragging-active");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        document.removeEventListener("touchmove", preventTouch, { passive: false });
        // Swallow the click that trails a drag so the accordion doesn't toggle.
        blockEl.addEventListener("click", swallowClick, true);
        setTimeout(function () { blockEl.removeEventListener("click", swallowClick, true); }, 350);
        syncBlockOrder();
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    }

    // Mouse: immediate drag from the grip (desktop).
    handle.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse") { e.preventDefault(); e.stopPropagation(); startDrag(); }
    });

    // Touch / pen: press-and-hold anywhere on the header enters move mode.
    header.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse") return; // grip handles the mouse case
      if (e.target.closest("button:not(.acc-header), a, input, textarea, .block-x")) return;
      var sx = e.clientX, sy = e.clientY, timer = setTimeout(fire, HOLD_MS);
      function fire() { timer = null; cleanup(); startDrag(); }
      function cleanup() {
        if (timer) { clearTimeout(timer); timer = null; }
        header.removeEventListener("pointermove", onWait);
        header.removeEventListener("pointerup", cleanup);
        header.removeEventListener("pointercancel", cleanup);
      }
      function onWait(ev) {
        if (Math.abs(ev.clientY - sy) > CANCEL_PX || Math.abs(ev.clientX - sx) > CANCEL_PX) cleanup();
      }
      header.addEventListener("pointermove", onWait);
      header.addEventListener("pointerup", cleanup);
      header.addEventListener("pointercancel", cleanup);
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

  // Adds a small "✕" to a block's header so the creator can remove the whole
  // widget. Used by every block type (sections, emergency, routine, logs).
  function addBlockRemoveBtn(headerEl, label, onRemove) {
    var x = document.createElement("button");
    x.type = "button";
    x.className = "block-x";
    x.textContent = "✕";
    x.title = label;
    x.setAttribute("aria-label", label);
    // Don't let the tap toggle the accordion or start a drag.
    x.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
    x.addEventListener("click", function (e) {
      e.stopPropagation(); e.preventDefault(); onRemove();
    });
    headerEl.appendChild(x);
    return x;
  }

  // Removes a whole widget. Sections/logs drop their data; the singleton
  // emergency and routine widgets are flagged off (so they aren't re-added on
  // the next render) and can be brought back from the add-block row.
  function removeWidget(type, el, ref) {
    var g = state.guide;
    if (type === "section") g.sections = g.sections.filter(function (s) { return s.id !== ref.id; });
    else if (type === "log") g.logs = g.logs.filter(function (l) { return l.id !== ref.id; });
    else if (type === "emergency") g.noEmergency = true;
    else if (type === "routine") g.noRoutine = true;
    else if (type === "videos") g.videos = null;
    else return;
    if (selectedEl === el) deselect();
    if (el && el.parentNode) el.remove();
    syncBlockOrder();   // rebuilds blockOrder from the remaining DOM (+ history)
    updateAddRow();
    reselectAfterRender();
  }

  // Shows the "add back" buttons for whichever singleton widgets are hidden.
  function updateAddRow() {
    var g = state.guide || {};
    var e = $("addEmergency"); if (e) e.hidden = !g.noEmergency;
    var r = $("addRoutine"); if (r) r.hidden = !g.noRoutine;
    var v = $("addVideos"); if (v) v.hidden = !!g.videos;
  }

  function buildSectionEl(sec, openFirst) {
    var el = document.createElement("div");
    el.className = "guide-section" + (openFirst ? " open" : "");
    el.dataset.id = sec.id;

    el.innerHTML =
      '<button class="acc-header" type="button">' +
        '<span class="drag-handle" title="Drag to reorder" aria-label="Drag to reorder">⠿</span>' +
        '<span class="acc-icon" contenteditable="true" role="textbox" aria-label="Section icon — type an emoji, or backspace to remove">' + esc(sec.icon || "") + "</span>" +
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
          e.target.classList.contains("acc-icon") ||
          e.target.classList.contains("drag-handle")) return;
      el.classList.toggle("open");
    });
    enableDrag(el.querySelector(".drag-handle"), el);
    addBlockRemoveBtn(header, "Remove this section", function () { removeWidget("section", el, sec); });

    bindEditable(el.querySelector(".acc-title-text"), function (v) { sec.title = v; });
    bindEditable(el.querySelector(".acc-icon"), function (v) {
      sec.icon = (v || "").replace(/\s+/g, "").slice(0, 16);
      scheduleHistory();
    });
    bindEditable(el.querySelector(".acc-content"), function (v) { sec.body = v; }, true);

    renderSectionMedia(el, sec);
    GotItStore.applyAccent(el, sec.color);
    return el;
  }

  // A section's videos as an array, migrating a legacy single video in place.
  function sectionVideos(sec) {
    if (!Array.isArray(sec.videos)) {
      sec.videos = (sec.videoEmbed || sec.videoId)
        ? [{ id: uid(), videoEmbed: sec.videoEmbed || null, videoId: sec.videoId || null, title: sec.videoTitle || "" }]
        : [];
      delete sec.videoEmbed; delete sec.videoId; delete sec.videoTitle;
    }
    return sec.videos;
  }
  // Adds a video to a section (from the dock or the empty-state prompt).
  function addSectionVideo(sec, el) {
    openVideoModal(function (embed) {
      sectionVideos(sec).push({ id: uid(), videoEmbed: embed, title: "" });
      renderSectionMedia(el, sec);
      if (!el.classList.contains("open")) el.classList.add("open");
      recordHistory();
    });
  }

  function renderSectionMedia(el, sec) {
    var media = el.querySelector(".sec-media");
    media.innerHTML = "";
    // Each media item gets a "×" to remove it and (when there's somewhere to put
    // it) a "⇄" to move it to another section. `ref` is the specific media object
    // (a photo or a video) — sections can hold several of each.
    function addItem(inner, kind, ref, onRemove, label) {
      var item = document.createElement("div");
      item.className = "sec-media-item";
      item.appendChild(inner);
      // Photos get a four-way "move" handle to enter reposition (pan/crop) mode
      // right on the image — plus, once cropped, a "show whole photo" toggle.
      if (kind === "photo") {
        var rp = document.createElement("button");
        rp.type = "button";
        rp.className = "sec-media-repos no-print";
        rp.innerHTML = MOVE_ICON_SVG;
        rp.title = "Reposition photo";
        rp.setAttribute("aria-label", "Reposition photo");
        rp.addEventListener("click", function (e) { e.stopPropagation(); startPhotoReposition(sec, ref, item); });
        item.appendChild(rp);
        if (ref && ref.pos) {
          var whole = document.createElement("button");
          whole.type = "button";
          whole.className = "sec-media-whole no-print";
          whole.textContent = "🖼";
          whole.title = "Show whole photo";
          whole.setAttribute("aria-label", "Show whole photo");
          whole.addEventListener("click", function (e) {
            e.stopPropagation(); ref.pos = null; renderSectionMedia(el, sec); recordHistory();
          });
          item.appendChild(whole);
        }
      }
      if (movableTargets(kind, sec).length) {
        var mv = document.createElement("button");
        mv.type = "button";
        mv.className = "sec-media-move";
        mv.textContent = "⇄";
        mv.title = "Move to another section";
        mv.setAttribute("aria-label", "Move to another section");
        mv.addEventListener("click", function (e) { e.stopPropagation(); openMoveMenu(mv, kind, ref, sec, el); });
        item.appendChild(mv);
      }
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
    var photos = sectionPhotos(sec);
    photos.forEach(function (photo) {
      var pEl = makePhotoEl(photo, function (val) { photo.title = val; });
      addItem(pEl, "photo", photo, function () {
        sec.photos = sectionPhotos(sec).filter(function (x) { return x !== photo; });
      }, "Remove photo");
    });
    var vids = sectionVideos(sec);
    vids.forEach(function (vid) {
      var src = videoSrc(vid);
      if (!src) return;
      var v = makeVideoEl(src, vid.title, function (val) { vid.title = val; });
      addItem(v, "video", vid, function () {
        sec.videos = sectionVideos(sec).filter(function (x) { return x !== vid; });
      }, "Remove video");
    });
    // Add-media affordances so photos/videos are discoverable without hunting for
    // the dock's camera icon. Both can hold several, so they always offer "add".
    var promptRow = document.createElement("div");
    promptRow.className = "sec-media-prompt no-print";
    var pp = document.createElement("button");
    pp.type = "button"; pp.className = "sec-media-prompt-btn";
    pp.textContent = photos.length ? "📷 Add another photo" : "📷 Add a photo";
    pp.addEventListener("click", function (e) { e.stopPropagation(); pickPhoto(sec, el); });
    promptRow.appendChild(pp);
    var pv = document.createElement("button");
    pv.type = "button"; pv.className = "sec-media-prompt-btn";
    pv.textContent = vids.length ? "🎬 Add another video" : "🎬 Add a video";
    pv.addEventListener("click", function (e) { e.stopPropagation(); addSectionVideo(sec, el); });
    promptRow.appendChild(pv);
    media.appendChild(promptRow);
  }

  // A section's photos as an array, migrating a legacy single photo in place.
  // Each photo: { id, src (data URL), pos (object-position crop, or null), title }.
  function sectionPhotos(sec) {
    if (!Array.isArray(sec.photos)) {
      sec.photos = sec.photo
        ? [{ id: uid(), src: sec.photo, pos: sec.photoPos || null, title: sec.photoTitle || "" }]
        : [];
      delete sec.photo; delete sec.photoPos; delete sec.photoTitle;
    }
    return sec.photos;
  }
  // A photo tile: the image plus an editable caption bar (mirrors makeVideoEl).
  function makePhotoEl(photo, onTitleChange) {
    var wrap = document.createElement("div");
    wrap.className = "sec-photo-wrap";
    var img = document.createElement("img");
    img.className = "sec-photo";
    img.src = photo.src;
    img.alt = "";
    if (photo.pos) { img.classList.add("is-cropped"); img.style.objectPosition = photo.pos; }
    wrap.appendChild(img);
    var ct = document.createElement("div");
    ct.className = "sec-photo-title";
    ct.setAttribute("contenteditable", "true");
    ct.setAttribute("data-ph", "Add a caption…");
    ct.setAttribute("aria-label", "Photo caption");
    ct.textContent = photo.title || "";
    bindEditable(ct, onTitleChange);
    wrap.appendChild(ct);
    return wrap;
  }

  // Sections a photo/video could be moved into: any other section (sections can
  // now hold several photos and videos).
  function movableTargets(kind, sec) {
    return (state.guide.sections || []).filter(function (t) { return t.id !== sec.id; });
  }
  function closeMoveMenu() {
    document.removeEventListener("click", closeMoveMenu);
    var m = document.querySelector(".media-move-menu");
    if (m && m.parentNode) m.parentNode.removeChild(m);
  }
  function openMoveMenu(anchorBtn, kind, ref, sec, srcEl) {
    closeMoveMenu();
    var targets = movableTargets(kind, sec);
    if (!targets.length) return;
    var menu = document.createElement("div");
    menu.className = "media-move-menu";
    var head = document.createElement("div");
    head.className = "media-move-head";
    head.textContent = "Move " + kind + " to…";
    menu.appendChild(head);
    targets.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "media-move-item";
      b.textContent = (t.icon ? t.icon + " " : "") + (t.title || "Untitled section");
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        moveMedia(kind, ref, sec, t, srcEl);
        closeMoveMenu();
      });
      menu.appendChild(b);
    });
    // Attach to <body> with fixed positioning so the video/accordion's
    // overflow:hidden can't clip it. Place it under the button, flipping up or
    // clamping to stay on-screen.
    document.body.appendChild(menu);
    var r = anchorBtn.getBoundingClientRect();
    var mw = menu.offsetWidth, mh = menu.offsetHeight;
    var left = Math.max(8, Math.min(r.right - mw, window.innerWidth - mw - 8));
    var top = r.bottom + 6;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    menu.style.left = left + "px";
    menu.style.top = top + "px";
    setTimeout(function () { document.addEventListener("click", closeMoveMenu); }, 0);
  }
  function moveMedia(kind, ref, sec, target, srcEl) {
    if (kind === "photo") {
      sectionPhotos(target).push(ref);
      sec.photos = sectionPhotos(sec).filter(function (x) { return x !== ref; });
    } else {
      sectionVideos(target).push(ref);
      sec.videos = sectionVideos(sec).filter(function (x) { return x !== ref; });
    }
    renderSectionMedia(srcEl, sec);
    var tEl = $("guideDoc").querySelector('.guide-section[data-id="' + target.id + '"]');
    if (tEl) { tEl.classList.add("open"); renderSectionMedia(tEl, target); }
    recordHistory();
    showToast("Moved to “" + (target.title || "section") + "”");
  }

  function pickPhoto(sec, el) {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true; // add several photos to a section at once
    input.addEventListener("change", function () {
      var files = Array.prototype.slice.call(input.files || []);
      if (!files.length) return;
      if (!el.classList.contains("open")) el.classList.add("open");
      // Compress + add sequentially so they keep their picked order.
      var chain = Promise.resolve();
      files.forEach(function (file) {
        chain = chain.then(function () {
          return compressImage(file, 1200, 0.72, 220000).then(function (dataUrl) {
            sectionPhotos(sec).push({ id: uid(), src: dataUrl, pos: null, title: "" });
            renderSectionMedia(el, sec);
          });
        });
      });
      chain.then(function () { recordHistory(); });
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
  // Upload one file to Cloudflare Stream; resolves with its embed URL.
  function uploadOneVideo(file, onProgress) {
    return GotItStore.videoUploadUrl(150).then(function (res) {
      if (!res || !res.uploadURL) {
        throw new Error((res && res.error) || "Video upload isn't available right now. You can paste a link instead.");
      }
      return new Promise(function (resolve, reject) {
        var form = new FormData();
        form.append("file", file);
        var xhr = new XMLHttpRequest();
        xhr.open("POST", res.uploadURL, true);
        xhr.upload.onprogress = function (ev) { if (ev.lengthComputable && onProgress) onProgress(ev.loaded / ev.total); };
        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) resolve("https://iframe.videodelivery.net/" + res.uid);
          else reject(new Error("Upload failed. Please try again."));
        };
        xhr.onerror = function () { reject(new Error("Upload failed. Check your connection and try again.")); };
        xhr.send(form);
      });
    });
  }

  // Upload one or more chosen videos (sequentially) and add each as a clip.
  function startVideoUpload(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    var LIMIT = 200 * 1024 * 1024;
    var tooBig = files.some(function (f) { return f.size > LIMIT; });
    files = files.filter(function (f) { return f.size <= LIMIT; });
    if (!files.length) {
      var e0 = $("videoErr");
      e0.textContent = tooBig ? "That video is too big (max about 200MB). Try a shorter clip." : "No video selected.";
      e0.hidden = false;
      return;
    }
    $("videoErr").hidden = true;
    var cb = videoOnAdd;
    var total = files.length, added = 0;
    videoUploading = true;
    $("videoUploadBtn").disabled = true;
    setVideoProgress(0, total > 1 ? "Uploading 1 of " + total + "…" : "Preparing…");

    function fail(err) {
      videoUploading = false;
      $("videoUploadBtn").disabled = false;
      setVideoProgress(null);
      var e = $("videoErr");
      e.textContent = (added ? added + " added, but the next failed: " : "") + ((err && err.message) || "Something went wrong. Please try again.");
      e.hidden = false;
    }
    function next(i) {
      if (i >= files.length) {
        setVideoProgress(1, "Done ✓");
        videoUploading = false;
        $("videoModal").hidden = true;
        videoOnAdd = null;
        showToast(added > 1
          ? added + " videos added — they'll be ready to play shortly."
          : "Video added — it'll be ready to play in a few seconds.");
        return;
      }
      uploadOneVideo(files[i], function (frac) {
        var lbl = total > 1
          ? "Uploading " + (i + 1) + " of " + total + "… " + Math.round(frac * 100) + "%"
          : "Uploading… " + Math.round(frac * 100) + "%";
        setVideoProgress((i + frac) / total, lbl);
      }).then(function (embedUrl) {
        added++;
        if (cb) cb(embedUrl);
        next(i + 1);
      }).catch(fail);
    }
    next(0);
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
    addBlockRemoveBtn(el.querySelector(".em-head"), "Remove emergency contacts", function () { removeWidget("emergency", el); });
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

  // Daily Routine widget: scheduled care (feeding, medication, walks) with
  // times. Stored on guide.routine.items; the published guide renders it as a
  // timeline and lets the sitter add the whole routine to their calendar.
  function buildRoutineEl() {
    var g = state.guide;
    if (!g.routine) g.routine = { items: [] };
    var el = document.createElement("div");
    el.className = "guide-routine";
    el.innerHTML =
      '<div class="routine-head">' +
        '<span class="drag-handle" title="Drag to reorder" aria-label="Drag to reorder">⠿</span>' +
        "<span>⏰ Daily Routine</span>" +
      "</div>" +
      '<p class="routine-hint">Scheduled care like feeding, medication and walks. Sitters can add the whole routine to their calendar.</p>';
    enableDrag(el.querySelector(".drag-handle"), el);
    addBlockRemoveBtn(el.querySelector(".routine-head"), "Remove daily routine", function () { removeWidget("routine", el); });
    var list = document.createElement("div");
    list.className = "routine-list";
    el.appendChild(list);

    function timeRow(item, i) {
      var row = document.createElement("div");
      row.className = "reminder-time-row";
      var inp = document.createElement("input");
      inp.type = "time"; inp.className = "q-input reminder-time"; inp.value = item.times[i];
      inp.addEventListener("change", function () { item.times[i] = inp.value || "08:00"; scheduleHistory(); });
      var rm = document.createElement("button");
      rm.type = "button"; rm.className = "reminder-time-x"; rm.title = "Remove time"; rm.textContent = "✕";
      rm.addEventListener("click", function () {
        item.times.splice(i, 1);
        if (!item.times.length) item.times.push("08:00");
        renderItems(); scheduleHistory();
      });
      row.appendChild(inp); row.appendChild(rm);
      return row;
    }

    function renderItems() {
      list.innerHTML = "";
      if (!g.routine.items.length) {
        var empty = document.createElement("p");
        empty.className = "routine-empty";
        empty.textContent = "No routine yet — add feeding, medication, walks…";
        list.appendChild(empty);
      }
      g.routine.items.forEach(function (item) {
        var card = document.createElement("div");
        card.className = "routine-item";

        var top = document.createElement("div");
        top.className = "routine-item-top";
        var icon = document.createElement("span");
        icon.className = "routine-item-icon"; icon.setAttribute("contenteditable", "true");
        icon.setAttribute("aria-label", "Icon"); icon.textContent = item.icon || "";
        bindEditable(icon, function (v) { item.icon = (v || "").replace(/\s+/g, "").slice(0, 16); scheduleHistory(); });
        var label = document.createElement("span");
        label.className = "routine-item-label"; label.setAttribute("contenteditable", "true");
        label.setAttribute("aria-label", "What"); label.textContent = item.label || "";
        bindEditable(label, function (v) { item.label = v; scheduleHistory(); });
        var del = document.createElement("button");
        del.type = "button"; del.className = "routine-item-del"; del.title = "Remove"; del.textContent = "✕";
        del.addEventListener("click", function () {
          g.routine.items = g.routine.items.filter(function (x) { return x.id !== item.id; });
          renderItems(); scheduleHistory();
        });
        top.appendChild(icon); top.appendChild(label); top.appendChild(del);
        card.appendChild(top);

        var times = document.createElement("div");
        times.className = "routine-times reminder-times";
        item.times = item.times && item.times.length ? item.times : ["08:00"];
        item.times.forEach(function (t, i) { times.appendChild(timeRow(item, i)); });
        var addTime = document.createElement("button");
        addTime.type = "button"; addTime.className = "reminder-add-time"; addTime.textContent = "＋ time";
        addTime.addEventListener("click", function () { item.times.push("12:00"); renderItems(); scheduleHistory(); });
        times.appendChild(addTime);
        card.appendChild(times);

        list.appendChild(card);
      });
    }
    renderItems();

    var add = document.createElement("button");
    add.className = "tool-btn"; add.type = "button"; add.textContent = "＋ Add routine item";
    add.style.marginTop = "12px";
    add.addEventListener("click", function () {
      g.routine.items.push({ id: uid(), icon: "💊", label: "Medication", times: ["08:00"] });
      renderItems(); scheduleHistory();
    });
    el.appendChild(add);
    return el;
  }

  // Dedicated Videos widget: a gallery of clips, each with its own title. Opt-in
  // (added from the add-block row), stored on guide.videos, block token "v".
  function buildVideosEl() {
    var g = state.guide;
    if (!g.videos) g.videos = { items: [] };
    var el = document.createElement("div");
    el.className = "guide-videos";
    el.innerHTML =
      '<div class="videos-head">' +
        '<span class="drag-handle" title="Drag to reorder" aria-label="Drag to reorder">⠿</span>' +
        "<span>🎬 Videos</span>" +
      "</div>" +
      '<p class="videos-hint">Short clips — a feeding demo, the walk route, how the alarm works. Give each one a title.</p>';
    enableDrag(el.querySelector(".drag-handle"), el);
    addBlockRemoveBtn(el.querySelector(".videos-head"), "Remove the videos widget", function () { removeWidget("videos", el); });
    var list = document.createElement("div");
    list.className = "videos-list";
    el.appendChild(list);

    function renderItems() {
      list.innerHTML = "";
      if (!g.videos.items.length) {
        var empty = document.createElement("p");
        empty.className = "routine-empty";
        empty.textContent = "No videos yet — add one below.";
        list.appendChild(empty);
      }
      g.videos.items.forEach(function (item) {
        var wrap = document.createElement("div");
        wrap.className = "videos-item";
        var src = videoSrc(item);
        if (src) wrap.appendChild(makeVideoEl(src, item.title, function (val) { item.title = val; }));
        var rm = document.createElement("button");
        rm.type = "button"; rm.className = "sec-media-x"; rm.textContent = "×";
        rm.title = "Remove video"; rm.setAttribute("aria-label", "Remove video");
        rm.addEventListener("click", function () {
          g.videos.items = g.videos.items.filter(function (x) { return x.id !== item.id; });
          renderItems(); recordHistory();
        });
        wrap.appendChild(rm);
        list.appendChild(wrap);
      });
    }
    renderItems();

    var add = document.createElement("button");
    add.className = "tool-btn"; add.type = "button"; add.textContent = "＋ Add a video";
    add.style.marginTop = "12px";
    add.addEventListener("click", function () {
      openVideoModal(function (embed) {
        g.videos.items.push({ id: uid(), videoEmbed: embed, title: "" });
        renderItems(); recordHistory();
      });
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
    addBlockRemoveBtn(el.querySelector(".log-head"), "Remove this log", function () { removeWidget("log", el, log); });
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

  // A video embed with an editable title bar over its top (readable over the
  // black/poster area; doesn't block the player once published).
  function makeVideoEl(src, title, onTitleChange) {
    var v = document.createElement("div");
    v.className = "sec-video";
    v.innerHTML = '<iframe src="' + src + '" allowfullscreen loading="lazy"></iframe>';
    var vt = document.createElement("div");
    vt.className = "sec-video-title";
    vt.setAttribute("contenteditable", "true");
    vt.setAttribute("data-ph", "Add a title…");
    vt.setAttribute("aria-label", "Video title");
    vt.textContent = title || "";
    bindEditable(vt, onTitleChange);
    v.appendChild(vt);
    return v;
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
    btn.textContent = "Saving…";

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
      logFeatureUsage(g, locked); // which features this guide uses (deduped by slug)
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
      btn.textContent = "Save & publish →";
    });
  }

  // Core: email the creator their links (and password, if the guide is locked)
  // so a lost edit link doesn't orphan the guide. Shared by the manual "email
  // me" field and the dashboard-save flow (which emails them by default).
  function doSendLinks(email) {
    var g = state.guide;
    if (!g) return Promise.resolve(null);
    return GotItStore.sendLinks({
      email: email,
      slug: g.slug,
      editToken: state.editToken,
      origin: window.location.origin,
      title: g.title,
      emoji: g.emoji,
      password: state.password || ""
    });
  }

  // Optional field: for people who'd rather not create an account.
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
    btn.disabled = true; btn.textContent = "Sending…";
    note.hidden = true;

    doSendLinks(email).then(function (res) {
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
    // Dashboard-save block: signed-in creators get it auto-saved on publish
    // (touchDashboard, running right after this); everyone else sees the CTA.
    var saveBtn = $("saveToDash");
    if (saveBtn) {
      if (window.GotItAuth && GotItAuth.isSignedIn()) {
        saveBtn.disabled = true; saveBtn.textContent = "Saving…";
        saveDashNote("Saving to your dashboard…", true);
      } else {
        saveBtn.disabled = false; saveBtn.textContent = "⭐ Save to my guides";
        if ($("myGuidesLink")) $("myGuidesLink").hidden = true;
        if ($("saveToDashNote")) $("saveToDashNote").hidden = true;
      }
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
    // Open popovers away from the nearest screen edge so they stay on-screen
    // even after the dock has been dragged to the left side.
    var dockRect = $("editDock").getBoundingClientRect();
    if (dockRect.left < window.innerWidth / 2) {
      pop.style.right = "auto"; pop.style.left = "calc(100% + 12px)";
    } else {
      pop.style.left = "auto"; pop.style.right = "calc(100% + 12px)";
    }
  }

  /* ---------- Draggable dock ---------- */
  function applyDockPos() {
    var dock = $("editDock");
    if (!dock || dock.hidden) return;
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem("gotit_dock_pos") || "null"); } catch (e) {}
    if (!saved) return;
    var w = dock.offsetWidth || 56, h = dock.offsetHeight || 380;
    var left = Math.max(6, Math.min(window.innerWidth - w - 6, saved.left));
    var top = Math.max(6, Math.min(window.innerHeight - h - 6, saved.top));
    dock.style.left = left + "px";
    dock.style.top = top + "px";
    dock.style.right = "auto";
    dock.style.transform = "none";
  }
  function resetDockPos() {
    var dock = $("editDock");
    if (!dock) return;
    try { localStorage.removeItem("gotit_dock_pos"); } catch (_) {}
    dock.style.left = ""; dock.style.top = "";
    dock.style.right = ""; dock.style.bottom = ""; dock.style.transform = "";
    showToast("Toolbar reset to the right");
  }
  function initDockDrag() {
    var dock = $("editDock"), grip = $("dockGrip");
    if (!dock || !grip) return;
    var dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0, lastTap = 0;
    grip.addEventListener("pointerdown", function (e) {
      // Double-tap / double-click the grip to snap back to the default spot.
      var now = Date.now();
      if (now - lastTap < 350) { lastTap = 0; resetDockPos(); return; }
      lastTap = now;
      dragging = true; moved = false;
      var r = dock.getBoundingClientRect();
      ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY;
      try { grip.setPointerCapture(e.pointerId); } catch (_) {}
    });
    grip.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      if (!moved) {
        if (Math.abs(e.clientX - sx) < 4 && Math.abs(e.clientY - sy) < 4) return; // ignore micro-moves (a tap)
        moved = true;
        dock.classList.add("dragging");
        dock.style.left = ox + "px"; dock.style.top = oy + "px";
        dock.style.right = "auto"; dock.style.bottom = "auto"; dock.style.transform = "none";
        closeDockPop();
      }
      var nx = Math.max(6, Math.min(window.innerWidth - dock.offsetWidth - 6, ox + (e.clientX - sx)));
      var ny = Math.max(6, Math.min(window.innerHeight - dock.offsetHeight - 6, oy + (e.clientY - sy)));
      dock.style.left = nx + "px"; dock.style.top = ny + "px";
    });
    function end(e) {
      if (!dragging) return;
      dragging = false;
      try { grip.releasePointerCapture(e.pointerId); } catch (_) {}
      if (!moved) return; // a tap, not a drag — don't pin/save
      dock.classList.remove("dragging");
      var r = dock.getBoundingClientRect();
      try { localStorage.setItem("gotit_dock_pos", JSON.stringify({ left: r.left, top: r.top })); } catch (_) {}
    }
    grip.addEventListener("pointerup", end);
    grip.addEventListener("pointercancel", end);
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
      if (state.guide.cover) item("↔ Reposition photo", function () { startCoverReposition(selectedEl); });
      if (state.guide.cover) item("🗑 Remove photo", function () { state.guide.cover = null; state.guide.coverPos = null; applyCover(selectedEl, state.guide); recordHistory(); });
      item("↕ Move title up/down", function () { startCoverTextMove(selectedEl); });
      if (state.guide.coverEmojiOff) item("😀 Add cover icon", function () {
        state.guide.coverEmojiOff = false; renderGuideEditor();
        var sp = $("guideDoc").querySelector(".cover-emoji"); if (sp) sp.focus();
      });
      return;
    }
    var sec = selectedRef, el = selectedEl;
    if (!el.classList.contains("open")) el.classList.add("open");
    item("📷 " + (sectionPhotos(sec).length ? "Add another photo" : "Photo"), function () { pickPhoto(sec, el); });
    item("🎬 " + (sectionVideos(sec).length ? "Add another video" : "Video"), function () { addSectionVideo(sec, el); });
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
  $("startPaste").addEventListener("click", function () { revealImport("paste"); });
  $("startTalk").addEventListener("click", function () { revealImport("talk"); });
  if ($("startPhoto")) $("startPhoto").addEventListener("click", function () { revealImport("photo"); });
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
  // "Or paste a link": read a public page / Google Doc server-side and drop its
  // text into the notes box, ready to turn into a guide.
  function readLinkIntoPaste() {
    var input = $("pasteUrl"), note = $("pasteUrlNote"), btn = $("pasteUrlGo");
    if (!input) return;
    var url = (input.value || "").trim();
    function say(kind, msg) { note.className = "import-link-note " + kind; note.textContent = msg; note.hidden = false; }
    if (!/^https?:\/\/\S+\.\S+/i.test(url)) { say("err", "Enter a full link starting with http:// or https://"); input.focus(); return; }
    var old = btn.textContent;
    btn.disabled = true; btn.textContent = "Reading…"; note.hidden = true;
    GotItStore.readUrl(url).then(function (res) {
      if (!res) { say("err", "Reading links needs the published site."); return; }
      if (!res.ok) { say("err", res.error || "Couldn't read that link."); return; }
      var ta = $("pasteText");
      var add = (res.title ? res.title + "\n\n" : "") + (res.text || "");
      ta.value = ta.value.trim() ? (ta.value.trim() + "\n\n" + add) : add;
      say("ok", "✓ Added the text from that link — give it a read, then create your guide.");
      input.value = "";
      setTimeout(function () { ta.scrollIntoView({ block: "center", behavior: "smooth" }); }, 40);
    }).catch(function () {
      say("err", "Couldn't read that link — try copying the text and pasting it instead.");
    }).then(function () { btn.disabled = false; btn.textContent = old; });
  }
  if ($("pasteUrlGo")) $("pasteUrlGo").addEventListener("click", readLinkIntoPaste);
  if ($("pasteUrl")) $("pasteUrl").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); readLinkIntoPaste(); }
  });
  $("previewBack").addEventListener("click", function () {
    state.qIndex = state.category.questions.length - 1;
    renderQuestion();
    showStep(2);
  });
  $("addSection").addEventListener("click", addSection);
  $("addLog").addEventListener("click", addLog);
  $("addEmergency").addEventListener("click", function () {
    state.guide.noEmergency = false; renderGuideEditor();
  });
  $("addRoutine").addEventListener("click", function () {
    state.guide.noRoutine = false; renderGuideEditor();
  });
  $("addVideos").addEventListener("click", function () {
    var g = state.guide;
    if (!g.videos) g.videos = { items: [] };
    if (!g.blockOrder) g.blockOrder = [];
    if (g.blockOrder.indexOf("v") === -1) {
      var ei = g.blockOrder.indexOf("e");
      if (ei >= 0) g.blockOrder.splice(ei, 0, "v"); else g.blockOrder.push("v");
    }
    renderGuideEditor();
  });
  $("publishBtn").addEventListener("click", publish);
  $("masterPolishBtn").addEventListener("click", masterPolish);
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
  initDockDrag(); // let users drag the floating toolbar to reposition it
  // Exit returns a signed-in user to their dashboard (account-less users go home).
  if ($("exitBtn") && window.GotItAuth && GotItAuth.isSignedIn()) $("exitBtn").href = "dashboard.html";
  // Warn before leaving with work that isn't safely saved. A published guide by
  // a signed-in user is auto-saved to their dashboard, so they're never nagged.
  if ($("exitBtn")) $("exitBtn").addEventListener("click", function (e) {
    if (currentStepKey === 1 || !state.guide) return;
    var signedIn = !!(window.GotItAuth && GotItAuth.isSignedIn());
    if (state.created && signedIn) return; // published + signed in = on the dashboard
    var msg = !state.created
      ? "You haven't hit “Save & publish” yet, so this guide isn't saved anywhere. If you leave now you'll lose it.\n\nLeave anyway?"
      : "This guide is published, but it isn't saved to a dashboard (you're not signed in). To edit it again later you'll need the edit link from the share screen.\n\nLeave anyway?";
    if (!window.confirm(msg)) e.preventDefault();
  });
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
  // On publish (signed in), make sure the guide is on the user's dashboard:
  // update the existing row, or auto-create one so newly published guides always
  // show up there (no more "I published it but can't find it"). Best-effort.
  function touchDashboard(g, locked) {
    if (!window.GotItAuth || !GotItAuth.isSignedIn()) return;
    GotItAuth.idToken().then(function (tok) {
      if (!tok) return;
      return GotItStore.listSavedGuides(tok).then(function (items) {
        var row = items.filter(function (x) { return x.slug === g.slug; })[0];
        if (row) {
          return GotItStore.updateSavedGuide(tok, row.id, { title: g.title, emoji: g.emoji, locked: !!locked })
            .then(reflectSavedToDash);
        }
        var payload = currentSavePayload();
        if (!payload) return;
        return GotItStore.saveGuide(tok, payload).then(reflectSavedToDash);
      });
    }).catch(function () {});
  }
  // Reflect "this guide is on your dashboard" on the share screen.
  function reflectSavedToDash() {
    var btn = $("saveToDash");
    if (btn) { btn.disabled = true; btn.textContent = "Saved ✓"; }
    if ($("myGuidesLink")) $("myGuidesLink").hidden = false;
    saveDashNote("✓ In your dashboard — find it any time under “My guides”.", true);
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
          // Also email their links as a backup, by default (best-effort).
          var u = GotItAuth.getUser && GotItAuth.getUser();
          if (u && u.email) {
            doSendLinks(u.email).then(function (res) {
              if (res !== null) saveDashNote("Saved to your dashboard ✓ — links emailed to you too", true);
            }).catch(function () {});
          }
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

  // Fires a "feat_<name>" analytics event (tagged with the guide slug) for each
  // feature this guide uses, so the stats page can count distinct guides per
  // feature. Best-effort; the stats Lambda dedupes by slug across re-publishes.
  function logFeatureUsage(g, locked) {
    var feats = [];
    if (g.cover) feats.push("cover");
    if ((g.sections || []).some(function (s) { return (Array.isArray(s.photos) ? s.photos.length : s.photo); })) feats.push("photo");
    if ((g.sections || []).some(function (s) { return s.videoEmbed || s.videoId; })) feats.push("video");
    if (g.routine && (g.routine.items || []).some(function (it) { return it.times && it.times.length; })) feats.push("routine");
    if ((g.logs || []).length) feats.push("log");
    if (locked) feats.push("lock");
    feats.forEach(function (f) { GotItStore.event("feat_" + f, g.slug); });
  }
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
  $("videoFileInput").addEventListener("change", function () { startVideoUpload(this.files); });
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
