/* ============================================================
   How2 — Landing page interactions
   ============================================================ */

(function () {
  "use strict";

  /* ---- Current year in footer ---- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

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

    var EXAMPLES = [
      { emoji: "🐶", title: "Whiskey 101", sub: "Everything my dog sitter needs",
        cards: [["🦴", "Daily Routine"], ["💊", "Medications", true], ["🚨", "Emergency Contacts"]] },
      { emoji: "🏠", title: "The Beach House", sub: "Your guide to a great stay",
        cards: [["🔑", "Getting In & Parking"], ["📶", "Wi-Fi & Essentials", true], ["📍", "Local Favourites"]] },
      { emoji: "👶", title: "Mia & Leo's Guide", sub: "Everything the carer needs",
        cards: [["🕐", "Routine & Bedtime"], ["🍎", "Food & Allergies", true], ["🚨", "Emergency Contacts"]] },
      { emoji: "🧑‍💼", title: "Barista Onboarding", sub: "Your first week, made simple",
        cards: [["👋", "Welcome"], ["📅", "Your First Day", true], ["🛠️", "Tools & Systems"]] },
      { emoji: "🎉", title: "Sam & Alex's Wedding", sub: "Everything you need for the day",
        cards: [["📍", "When & Where"], ["🗓️", "Run Sheet", true], ["📋", "Good to Know"]] },
      { emoji: "✏️", title: "Espresso Machine 101", sub: "How to pull the perfect shot",
        cards: [["📖", "Overview"], ["✅", "Steps", true], ["💡", "Tips"]] }
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
      (function (j) { dot.addEventListener("click", function () { go(j); restart(); }); })(i);
      dotsWrap.appendChild(dot);
    }
    var dots = dotsWrap.children;

    function go(i) {
      idx = (i + n) % n;
      track.style.transform = "translateX(" + (-idx * 100) + "%)";
      for (var k = 0; k < n; k++) dots[k].classList.toggle("active", k === idx);
    }

    var timer = null;
    function start() {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      timer = setInterval(function () { go(idx + 1); }, 3600);
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function restart() { stop(); start(); }

    // Swipe (pointer events: works for touch + mouse drag). The track follows
    // the finger in real time, then snaps to the next/prev slide on release.
    var startX = null, baseX = 0, width = 0, dragging = false;
    track.addEventListener("pointerdown", function (e) {
      width = track.getBoundingClientRect().width || 1;
      startX = e.clientX;
      baseX = -idx * width;
      dragging = true;
      track.style.transition = "none";
      stop();
      try { track.setPointerCapture(e.pointerId); } catch (err) {}
    });
    track.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      track.style.transform = "translateX(" + (baseX + (e.clientX - startX)) + "px)";
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      track.style.transition = "";
      var dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > Math.min(60, width * 0.2)) go(idx + (dx < 0 ? 1 : -1));
      else go(idx); // not far enough — snap back
      start(); // resume auto-rotate
    }
    track.addEventListener("pointerup", endDrag);
    track.addEventListener("pointercancel", endDrag);

    go(0);
    start();
  })();

  /* ---- Waitlist form (simulated for MVP) ---- */
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

      // Persist locally for MVP (no backend yet)
      try {
        var list = JSON.parse(localStorage.getItem("how2_waitlist") || "[]");
        if (list.indexOf(email) === -1) list.push(email);
        localStorage.setItem("how2_waitlist", JSON.stringify(list));
      } catch (err) {
        /* ignore storage errors */
      }

      msg.textContent = "🎉 You're on the list! We'll be in touch.";
      form.reset();
    });
  }
})();
