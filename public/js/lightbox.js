// Screenshot lightbox: a click on a terminal screenshot shows it full size over the page.
// Click anywhere or press Escape to close; focus returns to the screenshot link.
// Without JS the link opens the image directly.
(function initLightbox() {
  const links = document.querySelectorAll("figure.terminal a");
  if (!links.length) return;

  const overlay = document.createElement("div");
  overlay.className = "lightbox";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Full size screenshot. Click or press Escape to close.");
  overlay.tabIndex = -1;
  const image = document.createElement("img");
  overlay.appendChild(image);
  document.body.appendChild(overlay);

  let openedFrom = null;

  function open(link) {
    openedFrom = link;
    image.src = link.href;
    image.alt = link.querySelector("img")?.alt ?? "";
    overlay.classList.add("lightbox--open");
    document.body.classList.add("lightbox-open");
    overlay.focus();
  }

  function close() {
    overlay.classList.remove("lightbox--open");
    document.body.classList.remove("lightbox-open");
    openedFrom?.focus();
  }

  for (const link of links) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      open(link);
    });
  }
  overlay.addEventListener("click", close);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlay.classList.contains("lightbox--open")) close();
  });
})();
