// Interactive architecture drawing: selecting a part shows its note beside the drawing.
// Without JS every note stays visible as a plain list under the drawing.
(function initDiagrams() {
  const diagrams = document.querySelectorAll("[data-diagram]");
  if (!diagrams.length) return;

  const NEXT_KEYS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

  for (const diagram of diagrams) {
    const parts = Array.from(diagram.querySelectorAll("[data-part]"));
    const notes = Array.from(diagram.querySelectorAll("[data-note]"));
    if (!parts.length || !notes.length) continue;

    function select(part, { moveFocus }) {
      const id = part.dataset.part;
      for (const candidate of parts) candidate.setAttribute("aria-pressed", String(candidate === part));
      for (const note of notes) note.hidden = note.dataset.note !== id;
      if (moveFocus) part.focus();
    }

    parts.forEach((part, index) => {
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
        select(parts[(index + step + parts.length) % parts.length], { moveFocus: true });
      });
    });

    const first = parts.find((part) => part.dataset.part === "etw") ?? parts[0];
    select(first, { moveFocus: false });
  }
})();
