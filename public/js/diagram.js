// Interactive architecture drawing: selecting a part shows its note under the drawing.
// The page carries two drawings of the same parts (wide for desktop, portrait for phones);
// CSS shows one, and a selection made in either applies to both.
// Without JS every note stays visible as a plain list under the drawing.
(function initDiagrams() {
  const diagrams = document.querySelectorAll("[data-diagram]");
  if (!diagrams.length) return;

  const NEXT_KEYS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

  for (const diagram of diagrams) {
    const parts = Array.from(diagram.querySelectorAll("[data-part]"));
    const notes = Array.from(diagram.querySelectorAll("[data-note]"));
    if (!parts.length || !notes.length) continue;

    let selectedId = parts.some((part) => part.dataset.part === "etw") ? "etw" : parts[0].dataset.part;

    function render() {
      for (const part of parts) part.setAttribute("aria-pressed", String(part.dataset.part === selectedId));
      for (const note of notes) note.hidden = note.dataset.note !== selectedId;
    }

    // The note sits under the drawing, so bring it up when it would otherwise be off screen.
    function revealNote() {
      const note = notes.find((candidate) => candidate.dataset.note === selectedId);
      if (!note || note.getBoundingClientRect().top < window.innerHeight - 160) return;
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      note.scrollIntoView({ block: "nearest", behavior: smooth ? "smooth" : "auto" });
    }

    function select(part, { moveFocus }) {
      selectedId = part.dataset.part;
      render();
      if (moveFocus) part.focus({ preventScroll: true });
      revealNote();
    }

    for (const part of parts) {
      part.addEventListener("click", () => select(part, { moveFocus: false }));
      part.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select(part, { moveFocus: false });
          return;
        }
        const step = NEXT_KEYS[event.key];
        if (!step) return;
        event.preventDefault();
        const siblings = Array.from(part.ownerSVGElement.querySelectorAll("[data-part]"));
        const index = siblings.indexOf(part);
        select(siblings[(index + step + siblings.length) % siblings.length], { moveFocus: true });
      });
    }

    render();
  }
})();
