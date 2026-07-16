/* ============================================================
   GotIt Guides — Landing page interactions
   ============================================================ */

(function () {
  "use strict";

  /* ---- Current year in footer ---- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---- Header nav dropdown (jump to sections) ---- */
  var navToggle = document.getElementById("navToggle");
  var navDropdown = document.getElementById("navDropdown");
  if (navToggle && navDropdown) {
    var setNav = function (open) {
      navDropdown.hidden = !open;
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    };
    navToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      setNav(navDropdown.hidden);
    });
    navDropdown.addEventListener("click", function (e) {
      if (e.target.tagName === "A") setNav(false); // close after picking a section
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".nav-menu")) setNav(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setNav(false);
    });
  }

  /* ---- Sticky header shadow on scroll ---- */
  var header = document.getElementById("siteHeader");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("scrolled", window.scrollY > 8);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---- Scroll reveal on section entry ---- */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && reveals.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry, i) {
          if (entry.isIntersecting) {
            // small stagger for grouped items
            var delay = Math.min(i * 60, 240);
            setTimeout(function () {
              entry.target.classList.add("in");
            }, delay);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    reveals.forEach(function (el) {
      io.observe(el);
    });
  } else {
    // Fallback: just show everything
    reveals.forEach(function (el) {
      el.classList.add("in");
    });
  }

  /* ---- Hero phone: swipeable category examples ----
     Mirrors the builder's categories. Auto-advances, supports swipe + dots,
     and degrades to the single static slide if anything is unavailable. */
  (function heroCarousel() {
    var track = document.getElementById("mockTrack");
    var dotsWrap = document.getElementById("mockDots");
    if (!track || !dotsWrap) return;

    // Leads with pet care (the strongest wedge), then the other core handovers.
    var EXAMPLES = [
      { emoji: "🐶", title: "Whiskey's Care Guide", sub: "Everything my dog sitter needs",
        cards: [["🦴", "Feeding & Routine"], ["💊", "Medication", true], ["🚨", "Vet & Emergency"]] },
      { emoji: "🏠", title: "The Beach House", sub: "Everything my house guest needs",
        cards: [["🔑", "Getting In & Parking"], ["📶", "Wi-Fi & Essentials", true], ["📍", "Local Favourites"]] },
      { emoji: "👶", title: "Mia & Leo's Guide", sub: "Everything the babysitter needs",
        cards: [["🕐", "Routine & Bedtime"], ["🍎", "Food & Allergies", true], ["🚨", "Emergency Contacts"]] },
      { emoji: "🧑‍💼", title: "Team Onboarding", sub: "Everything a new starter needs",
        cards: [["👋", "Welcome"], ["📅", "First Week", true], ["🛠️", "Tools & Systems"]] }
    ];

    function slideHtml(ex) {
      var cards = ex.cards.map(function (c) {
        return '<div class="mock-card"><span class="mock-card-icon">' + c[0] + "</span>" +
          '<div><div class="mock-card-title">' + c[1] + "</div>" +
          '<div class="mock-card-bar' + (c[2] ? " short" : "") + '"></div></div></div>';
      }).join("");
      return '<div class="mock-slide"><div class="mock-cover">' +
        '<span class="mock-emoji">' + ex.emoji + "</span>" +
        '<div class="mock-title">' + ex.title + "</div>" +
        '<div class="mock-subtitle">' + ex.sub + "</div></div>" + cards + "</div>";
    }

    track.innerHTML = EXAMPLES.map(slideHtml).join("");
    var slides = track.children;
    var n = slides.length;
    var idx = 0;

    dotsWrap.innerHTML = "";
    for (var i = 0; i < n; i++) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "mock-dot";
      (function (j) { dot.addEventListener("click", function () { go(j); pauseAuto(); }); })(i);
      dotsWrap.appendChild(dot);
    }
    var dots = dotsWrap.children;

    function go(i) {
      idx = (i + n) % n;
      track.style.transform = "translateX(" + (-idx * 100) + "%)";
      for (var k = 0; k < n; k++) dots[k].classList.toggle("active", k === idx);
    }

    var timer = null, resumeT = null;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function startAuto() {
      stopAuto();
      if (reduce) return;
      timer = setInterval(function () { go(idx + 1); }, 3600);
    }
    function stopAuto() { if (timer) { clearInterval(timer); timer = null; } }
    // After the user interacts, hold auto-rotate so it doesn't fight them.
    function pauseAuto() { stopAuto(); clearTimeout(resumeT); resumeT = setTimeout(startAuto, 9000); }

    // Drag/swipe (pointer events; window-level so the gesture can't get lost).
    // We commit to a horizontal drag only once it clearly beats vertical, so the
    // page can still scroll when a touch starts on the carousel.
    var pid = null, downX = 0, downY = 0, curX = 0, width = 0, dragging = false, decided = false;
    track.addEventListener("pointerdown", function (e) {
      if (pid !== null) return;
      pid = e.pointerId;
      downX = curX = e.clientX;
      downY = e.clientY;
      dragging = false; decided = false;
      width = track.getBoundingClientRect().width || 1;
      stopAuto();
    });
    function onMove(e) {
      if (pid === null || e.pointerId !== pid) return;
      var dx = e.clientX - downX, dy = e.clientY - downY;
      if (!decided) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        decided = true;
        dragging = Math.abs(dx) > Math.abs(dy);
        if (dragging) track.style.transition = "none";
        else { pid = null; pauseAuto(); return; } // vertical — let the page scroll
      }
      if (dragging) {
        e.preventDefault();
        curX = e.clientX;
        track.style.transform = "translateX(" + (-idx * width + (curX - downX)) + "px)";
      }
    }
    function onUp(e) {
      if (pid === null || (e.pointerId !== undefined && e.pointerId !== pid)) return;
      var wasDragging = dragging, dx = curX - downX;
      pid = null; dragging = false; decided = false;
      if (wasDragging) {
        track.style.transition = "";
        if (Math.abs(dx) > Math.min(50, width * 0.18)) go(idx + (dx < 0 ? 1 : -1));
        else go(idx); // not far enough — snap back
      }
      pauseAuto();
    }
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    go(0);
    startAuto();
  })();

  /* ---- Waitlist form ----
     Sends the signup to the backend (a Feedback row with context "waitlist",
     which also lands in the team inbox). Only confirms success when it
     actually stored — the old localStorage-only version quietly lost every
     signup on the visitor's own device. */
  var form = document.getElementById("waitlistForm");
  var emailInput = document.getElementById("waitlistEmail");
  var msg = document.getElementById("waitlistMsg");

  if (form && emailInput && msg) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = emailInput.value.trim();
      var valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

      if (!valid) {
        msg.textContent = "Please enter a valid email address.";
        emailInput.focus();
        return;
      }
      if (!window.GotItStore || !GotItStore.feedback) {
        msg.textContent = "Something's not loading right — please try again in a moment.";
        return;
      }

      var btn = form.querySelector("button, input[type=submit]");
      if (btn) btn.disabled = true;
      msg.textContent = "Adding you…";

      GotItStore.feedback({
        message: "Waitlist signup",
        email: email,
        context: "waitlist",
      }).then(function () {
        msg.textContent = "🎉 You're on the list! We'll be in touch.";
        form.reset();
      }).catch(function () {
        msg.textContent = "Couldn't add you just now — please try again in a minute.";
      }).then(function () {
        if (btn) btn.disabled = false;
      });
    });
  }
})();
