// Live clock in header
function tickClock() {
  const el = document.getElementById("clock");
  if (!el) return;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  el.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}
tickClock();
setInterval(tickClock, 1000);

// Mobile nav toggle
const navToggle = document.getElementById("nav-toggle");
const navLinks = document.getElementById("nav-links");

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

// Screenshot lightbox: open full size over the post, close with a click or Esc
const shotLinks = document.querySelectorAll(".post-body figure.terminal a");

if (shotLinks.length) {
  const overlay = document.createElement("div");
  overlay.className = "lightbox";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Full size screenshot. Click or press Escape to close.");
  overlay.tabIndex = -1;
  const overlayImg = document.createElement("img");
  overlay.appendChild(overlayImg);
  document.body.appendChild(overlay);

  let lastLink = null;

  const closeLightbox = () => {
    overlay.classList.remove("open");
    document.body.classList.remove("lightbox-open");
    if (lastLink) lastLink.focus();
  };

  shotLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      lastLink = link;
      const img = link.querySelector("img");
      overlayImg.src = link.href;
      overlayImg.alt = img ? img.alt : "";
      overlay.classList.add("open");
      document.body.classList.add("lightbox-open");
      overlay.focus();
    });
  });

  overlay.addEventListener("click", closeLightbox);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open")) closeLightbox();
  });
}

// Contact form submission (Formspree)
const contactForm = document.getElementById("contact-form");
const formNote = document.getElementById("form-note");

if (contactForm) {
  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const submitBtn = contactForm.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    formNote.textContent = "Transmitting...";

    try {
      const response = await fetch(contactForm.action, {
        method: "POST",
        body: new FormData(contactForm),
        headers: { Accept: "application/json" },
      });

      if (response.ok) {
        formNote.textContent = "Message transmitted. I'll get back to you soon.";
        contactForm.reset();
      } else {
        const data = await response.json().catch(() => null);
        const detail = data?.errors?.[0]?.message || data?.error;
        formNote.textContent = detail
          ? `Transmission failed — ${detail}`
          : "Transmission failed — please try again or email me directly.";
      }
    } catch (err) {
      formNote.textContent = "Transmission failed — please try again or email me directly.";
    } finally {
      submitBtn.disabled = false;
    }
  });
}
