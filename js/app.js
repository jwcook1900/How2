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
